//! Phase 3C: dynamic branding (settings) and product categories.

mod common;

use common::*;
use gameon_timer_lib::db::{MIGRATIONS, latest_version};
use gameon_timer_lib::error::AppError;
use gameon_timer_lib::models::{CategoryInput, LineKind, ProductInput};
use gameon_timer_lib::state::open_store_with;
use gameon_timer_lib::{admin, billing, repo};
use rusqlite::Connection;

fn category_of(conn: &Connection, product: &str) -> Option<i64> {
    conn.query_row("SELECT category_id FROM products WHERE id = ?1", [product], |r| r.get(0)).unwrap()
}

fn category_named(conn: &Connection, name: &str) -> i64 {
    conn.query_row("SELECT id FROM categories WHERE name = ?1", [name], |r| r.get(0)).unwrap()
}

fn cat(name: &str, color: &str) -> CategoryInput {
    CategoryInput { name: name.into(), color: color.into() }
}

#[test]
fn upgrade_v3_to_v4_maps_categories_and_keeps_the_store_name() {
    let dir = temp();
    let session = {
        let (mut conn, _) = open_store_with(dir.path(), &MIGRATIONS[..3]).unwrap();
        seed_like_v1(&conn);
        conn.execute("UPDATE settings SET store_name = 'گیم‌نت آریا'", []).unwrap();
        let s = tx(&mut conn, |c| repo::start_session(c, "station-1", None, T0)).unwrap();
        tx(&mut conn, |c| repo::add_order_item(c, &s, "chips", 2, T0)).unwrap();
        s
    };

    let (conn, info) = gameon_timer_lib::state::open_store(dir.path()).unwrap();
    assert_eq!(info.migrated_from, Some(3));
    assert!(info.pre_migration_backup.is_some());
    assert_eq!(version(&conn), latest_version());

    // Old enum → category rows; every product keeps its grouping.
    assert_eq!(category_of(&conn, "water"), Some(category_named(&conn, "نوشیدنی")));
    assert_eq!(category_of(&conn, "soda"), Some(category_named(&conn, "نوشیدنی")));
    assert_eq!(category_of(&conn, "chips"), Some(category_named(&conn, "تنقلات")));
    assert_eq!(category_of(&conn, "sandwich"), Some(category_named(&conn, "غذا")));
    let has_old_column: bool = conn
        .query_row(
            "SELECT EXISTS (SELECT 1 FROM pragma_table_info('products') WHERE name = 'category')",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(!has_old_column, "fixed-list column dropped");

    // Branding defaults added; the operator's store name is untouched.
    let settings = repo::load_settings(&conn).unwrap();
    assert_eq!((settings.brand_color.as_str(), settings.logo_path.as_str()), ("#d4af37", ""));
    assert_eq!(settings.store_name, "گیم‌نت آریا");

    // Open sessions and their orders survive.
    let open = repo::load_open_session(&conn, &session).unwrap();
    assert_eq!(open.orders[0].quantity, 2);
    let counts: Vec<i64> = repo::load_categories(&conn).unwrap().iter().map(|c| c.product_count).collect();
    assert_eq!(counts, vec![2, 1, 1]);
}

#[test]
fn brand_colour_and_logo_are_validated() {
    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    let mut s = repo::load_settings(&conn).unwrap();
    assert_eq!((s.store_name.as_str(), s.brand_color.as_str()), ("گیم‌آن", "#d4af37"));

    s.brand_color = " #0A8 ".into(); // short form, mixed case, spaces
    tx(&mut conn, |c| admin::update_settings(c, &s, T0)).unwrap();
    assert_eq!(repo::load_settings(&conn).unwrap().brand_color, "#00aa88");

    for bad in ["red", "#12345", "#gggggg", "0a84ff", ""] {
        s.brand_color = bad.into();
        assert!(
            matches!(tx(&mut conn, |c| admin::update_settings(c, &s, T0)), Err(AppError::Validation(_))),
            "{bad}"
        );
    }
    assert!(conn.execute("UPDATE settings SET brand_color = 'red'", []).is_err(), "database CHECK");

    s.brand_color = "#0a84ff".into();
    let files = temp();
    let png = files.path().join("logo.png");
    std::fs::write(&png, [0x89, b'P', b'N', b'G']).unwrap();
    for bad in ["logo.png".to_owned(), files.path().join("missing.png").to_string_lossy().into_owned()] {
        s.logo_path = bad.clone();
        assert!(
            matches!(tx(&mut conn, |c| admin::update_settings(c, &s, T0)), Err(AppError::Validation(_))),
            "{bad}"
        );
    }
    s.logo_path = png.to_string_lossy().into_owned();
    tx(&mut conn, |c| admin::update_settings(c, &s, T0)).unwrap();
    let saved = repo::load_settings(&conn).unwrap();
    assert_eq!(saved.logo_path, png.to_string_lossy(), "absolute path stored as given");
    assert!(
        gameon_timer_lib::logo::read_logo_data_url(&saved.logo_path)
            .unwrap()
            .starts_with("data:image/png;base64,")
    );

    s.logo_path = String::new();
    tx(&mut conn, |c| admin::update_settings(c, &s, T0)).unwrap();
    assert_eq!(repo::load_settings(&conn).unwrap().logo_path, "");
}

#[test]
fn category_crud_and_validation() {
    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    let id = tx(&mut conn, |c| admin::create_category(c, &cat("  نوشیدنی گرم ", "#FA0"))).unwrap();
    let created = repo::load_categories(&conn).unwrap().into_iter().find(|c| c.id == id).unwrap();
    assert_eq!(
        (created.name.as_str(), created.color.as_str(), created.product_count),
        ("نوشیدنی گرم", "#ffaa00", 0)
    );

    for bad in [cat("نوشیدنی", "#ffffff"), cat("  ", "#ffffff"), cat("جدید", "blue")] {
        assert!(matches!(tx(&mut conn, |c| admin::create_category(c, &bad)), Err(AppError::Validation(_))));
    }
    tx(&mut conn, |c| admin::update_category(c, id, &cat("داغ", "#ff3b30"))).unwrap();
    assert!(repo::load_categories(&conn).unwrap().iter().any(|c| c.name == "داغ" && c.color == "#ff3b30"));
    assert!(matches!(
        tx(&mut conn, |c| admin::update_category(c, 999, &cat("x", "#000000"))),
        Err(AppError::NotFound(_))
    ));
}

#[test]
fn deleting_a_category_reassigns_its_products_atomically() {
    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    let drinks = category_named(&conn, "نوشیدنی");
    let snacks = category_named(&conn, "تنقلات");

    // Rejected deletes change nothing.
    for target in [Some(snacks), Some(9_999)] {
        let err = tx(&mut conn, |c| admin::delete_category(c, snacks, target, T0)).unwrap_err();
        assert!(matches!(err, AppError::Validation(_)), "{err}");
    }
    assert_eq!(category_of(&conn, "chips"), Some(snacks));
    assert_eq!(repo::load_categories(&conn).unwrap().len(), 3);

    // Move snacks into drinks, then delete — one transaction.
    tx(&mut conn, |c| admin::delete_category(c, snacks, Some(drinks), T0)).unwrap();
    for product in ["chips", "puff", "cake"] {
        assert_eq!(category_of(&conn, product), Some(drinks), "{product}");
    }
    assert_eq!(
        repo::load_categories(&conn).unwrap().iter().find(|c| c.id == drinks).unwrap().product_count,
        7
    );

    // Without a target the products become uncategorised.
    let food = category_named(&conn, "غذا");
    tx(&mut conn, |c| admin::delete_category(c, food, None, T0)).unwrap();
    assert_eq!(category_of(&conn, "sandwich"), None);
}

#[test]
fn bulk_recategorisation_is_all_or_nothing() {
    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    let drinks = category_named(&conn, "نوشیدنی");
    let food = category_named(&conn, "غذا");
    let ids = |list: &[&str]| list.iter().map(|s| s.to_string()).collect::<Vec<_>>();

    let err = tx(&mut conn, |c| {
        admin::assign_products_category(c, &ids(&["soda", "chips", "nope"]), Some(food), T0)
    })
    .unwrap_err();
    assert!(matches!(err, AppError::NotFound(_)));
    // Ids are applied in sorted order, so "chips" was written before "nope"
    // failed: the transaction must have undone it.
    let snacks = category_named(&conn, "تنقلات");
    assert_eq!(category_of(&conn, "chips"), Some(snacks), "rolled back: no partial move");
    assert_eq!(category_of(&conn, "soda"), Some(drinks));

    assert!(tx(&mut conn, |c| admin::assign_products_category(c, &[], Some(food), T0)).is_err());
    assert!(tx(&mut conn, |c| admin::assign_products_category(c, &ids(&["soda"]), Some(9_999), T0)).is_err());

    let moved = tx(&mut conn, |c| {
        admin::assign_products_category(c, &ids(&["soda", "chips", "soda"]), Some(food), T0)
    })
    .unwrap();
    assert_eq!(moved, 2);
    assert_eq!((category_of(&conn, "soda"), category_of(&conn, "chips")), (Some(food), Some(food)));
    tx(&mut conn, |c| admin::assign_products_category(c, &ids(&["soda"]), None, T0)).unwrap();
    assert_eq!(category_of(&conn, "soda"), None);
}

#[test]
fn uncategorised_products_stay_fully_functional() {
    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    let input = ProductInput {
        name: "آبمیوه".into(),
        category_id: None,
        price: 35_000,
        active: true,
        stock_quantity: Some(3),
    };
    let juice = tx(&mut conn, |c| admin::create_product(c, &input, T0)).unwrap();
    assert!(
        repo::load_products(&conn, true).unwrap().iter().any(|p| p.id == juice && p.category_id.is_none())
    );

    let s = tx(&mut conn, |c| repo::start_session(c, "station-1", None, T0)).unwrap();
    tx(&mut conn, |c| repo::add_order_item(c, &s, &juice, 2, T0)).unwrap();
    let at = T0 + 30 * MIN;
    let total = repo::preview_checkout(&conn, &s, at, at).unwrap().total;
    let invoice = tx(&mut conn, |c| repo::checkout(c, &s, at, Some(total), at)).unwrap();
    billing::verify_invoice(&invoice).unwrap();
    assert!(invoice.lines.iter().any(|l| l.kind == LineKind::Item && l.label == "آبمیوه" && l.quantity == 2));

    // The foreign key itself never strands a product: deleting a category in
    // raw SQL leaves its products uncategorised.
    let drinks = category_named(&conn, "نوشیدنی");
    conn.execute("DELETE FROM categories WHERE id = ?1", [drinks]).unwrap();
    assert_eq!(category_of(&conn, "soda"), None);
}
