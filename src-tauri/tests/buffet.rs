//! Phase 3B: buffet inventory — stock, active-session rule, invoice integration.

mod common;

use common::*;
use gameon_timer_lib::db::{MIGRATIONS, latest_version};
use gameon_timer_lib::error::AppError;
use gameon_timer_lib::models::{LineKind, ProductInput};
use gameon_timer_lib::state::open_store_with;
use gameon_timer_lib::{admin, billing, repo};
use rusqlite::Connection;

fn stock(conn: &Connection, product: &str) -> Option<i64> {
    conn.query_row("SELECT stock_quantity FROM products WHERE id = ?1", [product], |r| r.get(0)).unwrap()
}

/// (quantity, stock_units) of the session's line for `product`, if any.
fn line(conn: &Connection, session: &str, product: &str) -> Option<(i64, i64)> {
    conn.query_row(
        "SELECT quantity, stock_units FROM order_items WHERE session_id = ?1 AND product_id = ?2",
        [session, product],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .ok()
}

fn set_stock(conn: &mut Connection, product: &str, value: Option<i64>) {
    let p = repo::load_products(conn, false).unwrap().into_iter().find(|p| p.id == product).unwrap();
    let input = ProductInput {
        name: p.name,
        category_id: p.category_id,
        price: p.price,
        active: p.active,
        stock_quantity: value,
    };
    tx(conn, |c| admin::update_product(c, product, &input, T0)).unwrap();
}

fn start(conn: &mut Connection, station: &str) -> String {
    tx(conn, |c| repo::start_session(c, station, None, T0)).unwrap()
}

fn order(conn: &mut Connection, session: &str, product: &str, qty: i64) -> Result<(), AppError> {
    tx(conn, |c| repo::add_order_item(c, session, product, qty, T0 + MIN))
}

#[test]
fn stock_is_taken_atomically_and_never_goes_negative() {
    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    set_stock(&mut conn, "soda", Some(3));
    let s = start(&mut conn, "station-1");

    order(&mut conn, &s, "soda", 2).unwrap();
    assert_eq!(stock(&conn, "soda"), Some(1));
    assert_eq!(line(&conn, &s, "soda"), Some((2, 2)));

    let err = order(&mut conn, &s, "soda", 2).unwrap_err();
    assert!(matches!(err, AppError::Conflict(_)) && err.to_string().contains("فقط ۱ عدد"), "{err}");
    assert_eq!(stock(&conn, "soda"), Some(1), "rejected order writes nothing");
    assert_eq!(line(&conn, &s, "soda"), Some((2, 2)));

    order(&mut conn, &s, "soda", 1).unwrap();
    assert_eq!(stock(&conn, "soda"), Some(0));
    let err = order(&mut conn, &s, "soda", 1).unwrap_err();
    assert!(err.to_string().contains("تمام شده"), "{err}");
    assert_eq!(line(&conn, &s, "soda"), Some((3, 3)));

    // The database itself refuses negative stock.
    assert!(conn.execute("UPDATE products SET stock_quantity = -1 WHERE id = 'soda'", []).is_err());
    assert!(conn.execute("UPDATE order_items SET stock_units = 99 WHERE session_id = ?1", [&s]).is_err());
}

#[test]
fn uncounted_items_are_unlimited() {
    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    let s = start(&mut conn, "station-1");
    assert_eq!(stock(&conn, "coffee"), None, "seeded items are not counted");
    order(&mut conn, &s, "coffee", 60).unwrap();
    order(&mut conn, &s, "coffee", 39).unwrap();
    assert_eq!(stock(&conn, "coffee"), None);
    assert_eq!(line(&conn, &s, "coffee"), Some((99, 0)));
}

#[test]
fn orders_require_an_active_session() {
    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    set_stock(&mut conn, "soda", Some(5));

    // No such session.
    assert!(matches!(order(&mut conn, "no-session", "soda", 1), Err(AppError::NotFound(_))));

    // Paused is still an open session: allowed.
    let s = start(&mut conn, "station-1");
    tx(&mut conn, |c| repo::pause_session(c, &s, T0 + MIN)).unwrap();
    order(&mut conn, &s, "soda", 1).unwrap();

    // Closed (checked out): rejected, stock untouched.
    let at = T0 + 10 * MIN;
    let total = repo::preview_checkout(&conn, &s, at, at).unwrap().total;
    tx(&mut conn, |c| repo::checkout(c, &s, at, Some(total), at)).unwrap();
    assert!(matches!(order(&mut conn, &s, "soda", 1), Err(AppError::Conflict(_))));
    assert_eq!(stock(&conn, "soda"), Some(4));
}

#[test]
fn quantity_must_be_between_1_and_99() {
    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    set_stock(&mut conn, "soda", Some(500));
    let s = start(&mut conn, "station-1");
    for bad in [0, -3, 100] {
        assert!(matches!(order(&mut conn, &s, "soda", bad), Err(AppError::Validation(_))), "{bad}");
    }
    assert_eq!(stock(&conn, "soda"), Some(500));
}

#[test]
fn removing_returns_exactly_the_counted_units() {
    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    let s = start(&mut conn, "station-1");
    order(&mut conn, &s, "water", 1).unwrap(); // not counted yet
    set_stock(&mut conn, "water", Some(5)); // counting starts
    order(&mut conn, &s, "water", 2).unwrap();
    assert_eq!((stock(&conn, "water"), line(&conn, &s, "water")), (Some(3), Some((3, 2))));

    for _ in 0..3 {
        tx(&mut conn, |c| repo::remove_order_item(c, &s, "water", T0 + 2 * MIN)).unwrap();
    }
    assert_eq!(stock(&conn, "water"), Some(5), "two counted units back, the uncounted one not invented");
    assert_eq!(line(&conn, &s, "water"), None);

    // Counting switched off: removing never touches stock.
    order(&mut conn, &s, "water", 1).unwrap();
    set_stock(&mut conn, "water", None);
    tx(&mut conn, |c| repo::remove_order_item(c, &s, "water", T0)).unwrap();
    assert_eq!(stock(&conn, "water"), None);
}

#[test]
fn buffet_orders_are_invoice_lines_and_checkout_keeps_stock() {
    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    set_stock(&mut conn, "soda", Some(10));
    set_stock(&mut conn, "chips", Some(4));
    let s = start(&mut conn, "station-2");
    order(&mut conn, &s, "soda", 2).unwrap();
    order(&mut conn, &s, "chips", 1).unwrap();

    let at = T0 + 30 * MIN;
    let preview = repo::preview_checkout(&conn, &s, at, at).unwrap();
    let items: Vec<(String, i64, i64, i64)> = preview
        .lines
        .iter()
        .filter(|l| l.kind == LineKind::Item)
        .map(|l| (l.label.clone(), l.unit_price, l.quantity, l.amount))
        .collect();
    assert_eq!(items, vec![("نوشابه".into(), 25_000, 2, 50_000), ("چیپس".into(), 30_000, 1, 30_000)]);
    assert_eq!(preview.orders_total, 80_000);
    assert_eq!(preview.subtotal, preview.time_total + 80_000);

    let invoice = tx(&mut conn, |c| repo::checkout(c, &s, at, Some(preview.total), at)).unwrap();
    billing::verify_invoice(&invoice).unwrap();
    assert_eq!(repo::load_invoice(&conn, &invoice.id).unwrap().orders_total, 80_000);
    assert_eq!((stock(&conn, "soda"), stock(&conn, "chips")), (Some(8), Some(3)), "sold stock stays sold");
}

#[test]
fn available_items_exclude_inactive_and_sold_out() {
    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    set_stock(&mut conn, "soda", Some(0));
    let mut chips = repo::load_products(&conn, false).unwrap().into_iter().find(|p| p.id == "chips").unwrap();
    chips.active = false;
    let input = ProductInput {
        name: chips.name,
        category_id: chips.category_id,
        price: chips.price,
        active: false,
        stock_quantity: None,
    };
    tx(&mut conn, |c| admin::update_product(c, "chips", &input, T0)).unwrap();

    let available: Vec<String> =
        repo::load_products(&conn, true).unwrap().into_iter().map(|p| p.id).collect();
    assert!(!available.contains(&"soda".into()) && !available.contains(&"chips".into()));
    assert!(available.contains(&"coffee".into()), "uncounted active items stay available");
    assert_eq!(repo::load_products(&conn, false).unwrap().len(), 8);
}

#[test]
fn product_admin_validation() {
    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    let good = ProductInput {
        name: "آبمیوه".into(),
        category_id: Some(1),
        price: 35_000,
        active: true,
        stock_quantity: Some(12),
    };
    let bad = |f: &dyn Fn(&mut ProductInput)| {
        let mut input = good.clone();
        f(&mut input);
        input
    };
    for input in [
        bad(&|i| i.stock_quantity = Some(-1)),
        bad(&|i| i.name = "   ".into()),
        bad(&|i| i.name = "نوشابه".into()),  // duplicate
        bad(&|i| i.category_id = Some(999)), // no such category
        bad(&|i| i.price = -1),
        bad(&|i| i.price = 100_000_001),
    ] {
        assert!(matches!(
            tx(&mut conn, |c| admin::create_product(c, &input, T0)),
            Err(AppError::Validation(_))
        ));
    }
    let id = tx(&mut conn, |c| admin::create_product(c, &good, T0)).unwrap();
    let products = repo::load_products(&conn, false).unwrap();
    let created = products.last().unwrap();
    assert_eq!((created.id.as_str(), created.stock_quantity), (id.as_str(), Some(12)), "appended, counted");
    assert!(matches!(
        tx(&mut conn, |c| admin::update_product(c, "missing", &good, T0)),
        Err(AppError::NotFound(_)) | Err(AppError::Validation(_))
    ));
}

#[test]
fn upgrade_from_v2_keeps_existing_items_and_orders_sellable() {
    let dir = temp();
    {
        let (mut conn, _) = open_store_with(dir.path(), &MIGRATIONS[..2]).unwrap();
        seed_like_v1(&conn);
        let s = tx(&mut conn, |c| repo::start_session(c, "station-1", None, T0)).unwrap();
        // v2 schema has no stock columns: insert an order the way v2 did.
        conn.execute(
            "INSERT INTO order_items (session_id, product_id, name, unit_price, quantity, added_at)
             VALUES (?1, 'soda', 'نوشابه', 25000, 2, ?2)",
            rusqlite::params![s, T0],
        )
        .unwrap();
    }
    let (mut conn, info) = gameon_timer_lib::state::open_store(dir.path()).unwrap();
    assert_eq!(info.migrated_from, Some(2));
    assert!(info.pre_migration_backup.is_some());
    assert_eq!(version(&conn), latest_version());

    let s = repo::load_floor(&conn).unwrap().sessions[0].id.clone();
    assert!(
        repo::load_products(&conn, false).unwrap().iter().all(|p| p.stock_quantity.is_none()),
        "nothing blocked by the upgrade"
    );
    assert_eq!(line(&conn, &s, "soda"), Some((2, 0)));
    order(&mut conn, &s, "soda", 1).unwrap();
    tx(&mut conn, |c| repo::remove_order_item(c, &s, "soda", T0)).unwrap();
    assert_eq!(line(&conn, &s, "soda"), Some((2, 0)));
}
