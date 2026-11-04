//! Restart recovery, rate snapshots and invoice consistency.

mod common;

use common::*;
use gameon_timer_lib::error::AppError;
use gameon_timer_lib::models::{RatePlanInput, RateTier, RoundingMode, StationInput, StationKind};
use gameon_timer_lib::{admin, billing, repo};

fn start(conn: &mut rusqlite::Connection, station: &str, controllers: Option<i64>, at: i64) -> String {
    tx(conn, |c| repo::start_session(c, station, controllers, at)).unwrap()
}

#[test]
fn open_sessions_survive_restart_and_hard_crash() {
    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    let id = start(&mut conn, "station-1", Some(2), T0);
    tx(&mut conn, |c| repo::add_order_item(c, &id, "soda", T0 + MIN)).unwrap();
    tx(&mut conn, |c| repo::pause_session(c, &id, T0 + 20 * MIN)).unwrap();
    tx(&mut conn, |c| repo::resume_session(c, &id, T0 + 30 * MIN)).unwrap();

    // Simulate a power cut: never close the connection or checkpoint the WAL.
    std::mem::forget(conn);

    let conn = open(dir.path());
    let floor = repo::load_floor(&conn).unwrap();
    let session = floor.sessions.iter().find(|s| s.id == id).expect("session recovered");
    assert_eq!(session.segments.len(), 2);
    assert!(session.open_segment().is_some(), "still running after restart");
    assert_eq!(session.orders[0].quantity, 1);

    // Time kept running while the app was down (customer still playing).
    let preview = repo::preview_checkout(&conn, &id, T0 + 70 * MIN, T0 + 70 * MIN).unwrap();
    assert_eq!(preview.played_ms, 60 * MIN);
    assert_eq!(preview.paused_ms, 10 * MIN);
    assert_eq!(preview.time_total, 150_000);
    assert_eq!(preview.total, 175_000);
}

#[test]
fn one_open_session_per_station_is_enforced_twice() {
    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    start(&mut conn, "station-1", None, T0);
    let err = tx(&mut conn, |c| repo::start_session(c, "station-1", None, T0 + 1)).unwrap_err();
    assert!(matches!(err, AppError::Conflict(_)));
    // And by the database itself, bypassing the application check:
    let raw = conn.execute(
        "INSERT INTO sessions (id, station_id, rate_plan_id, rate_plan_name, controllers, started_at)
         VALUES ('x', 'station-1', 'plan-ps5', 'p', 1, 0)",
        [],
    );
    assert!(raw.is_err());
}

#[test]
fn checkout_produces_a_consistent_immutable_invoice() {
    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    let id = start(&mut conn, "station-2", Some(2), T0);
    tx(&mut conn, |c| repo::add_order_item(c, &id, "soda", T0)).unwrap();
    tx(&mut conn, |c| repo::add_order_item(c, &id, "soda", T0)).unwrap();
    tx(&mut conn, |c| repo::add_order_item(c, &id, "chips", T0)).unwrap();
    tx(&mut conn, |c| repo::remove_order_item(c, &id, "chips")).unwrap();
    tx(&mut conn, |c| repo::set_controllers(c, &id, 4, T0 + 30 * MIN)).unwrap();

    let at = T0 + 45 * MIN;
    let preview = repo::preview_checkout(&conn, &id, at, at).unwrap();
    // 30 min × 150k + 15 min × 230k + 2 × 25k = 75,000 + 57,500 + 50,000
    assert_eq!(preview.subtotal, 182_500);
    assert_eq!(preview.total, 183_000);
    assert_eq!(preview.lines.len(), 3);

    let invoice = tx(&mut conn, |c| repo::checkout(c, &id, at, Some(preview.total), at + 1000)).unwrap();
    assert_eq!(invoice.total, preview.total);
    assert_eq!(invoice.number, 1);
    billing::verify_invoice(&invoice).unwrap();

    let stored = repo::load_invoice(&conn, &invoice.id).unwrap();
    assert_eq!(stored, invoice, "what was returned is what was stored");
    assert!(repo::load_floor(&conn).unwrap().sessions.is_empty(), "station is free");
    assert_eq!(repo::day_summary(&conn, T0, T0 + 24 * HOUR).unwrap().revenue, 183_000);

    // Immutability, enforced by triggers.
    assert!(conn.execute("UPDATE invoices SET total = 0", []).is_err());
    assert!(conn.execute("DELETE FROM invoices", []).is_err());
    assert!(conn.execute("UPDATE invoice_lines SET amount = 0", []).is_err());
    assert!(conn.execute("UPDATE sessions SET closed_at = NULL WHERE id = ?1", [&id]).is_err());
    assert!(tx(&mut conn, |c| repo::add_order_item(c, &id, "soda", at)).is_err());
    assert!(
        conn.execute(
            "INSERT INTO order_items (session_id, name, unit_price, quantity, added_at) VALUES (?1, 'x', 1, 1, 0)",
            [&id]
        )
        .is_err(),
        "closed session rejects orders at the database level"
    );
}

#[test]
fn stale_preview_and_double_checkout_are_rejected_without_writing() {
    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    let id = start(&mut conn, "station-3", None, T0);
    let at = T0 + 30 * MIN;
    let preview = repo::preview_checkout(&conn, &id, at, at).unwrap();
    tx(&mut conn, |c| repo::add_order_item(c, &id, "sandwich", at)).unwrap();

    let err = tx(&mut conn, |c| repo::checkout(c, &id, at, Some(preview.total), at)).unwrap_err();
    assert!(matches!(err, AppError::Conflict(_)), "{err}");
    assert_eq!(count(&conn, "invoices"), 0);
    assert_eq!(repo::load_floor(&conn).unwrap().sessions.len(), 1);

    let fresh = repo::preview_checkout(&conn, &id, at, at).unwrap();
    tx(&mut conn, |c| repo::checkout(c, &id, at, Some(fresh.total), at)).unwrap();
    let again = tx(&mut conn, |c| repo::checkout(c, &id, at, Some(fresh.total), at)).unwrap_err();
    assert!(matches!(again, AppError::Conflict(_)));
    assert_eq!(count(&conn, "invoices"), 1);
}

#[test]
fn checkout_time_must_not_precede_the_last_session_event() {
    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    let id = start(&mut conn, "station-1", None, T0);
    tx(&mut conn, |c| repo::pause_session(c, &id, T0 + 10 * MIN)).unwrap();
    assert!(matches!(
        repo::preview_checkout(&conn, &id, T0 + 5 * MIN, T0 + 11 * MIN),
        Err(AppError::Conflict(_))
    ));
    assert!(repo::preview_checkout(&conn, &id, T0 + HOUR, T0).is_err(), "future checkout refused");
}

#[test]
fn later_changes_never_rewrite_history() {
    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    let id = start(&mut conn, "station-1", Some(2), T0);
    tx(&mut conn, |c| repo::add_order_item(c, &id, "coffee", T0)).unwrap();
    let at = T0 + HOUR;
    let total = repo::preview_checkout(&conn, &id, at, at).unwrap().total;
    let invoice = tx(&mut conn, |c| repo::checkout(c, &id, at, Some(total), at)).unwrap();

    // Change everything that fed into that bill.
    tx(&mut conn, |c| {
        admin::update_rate_plan(
            c,
            "plan-ps5",
            &RatePlanInput {
                name: "PS5 گران".into(),
                tiers: vec![RateTier { controllers: 2, hourly_rate: 999_000 }],
            },
            at,
        )?;
        c.execute("UPDATE products SET price = 99000, name = 'اسپرسو' WHERE id = 'coffee'", [])?;
        let mut s = repo::load_settings(c)?;
        s.rounding_unit = 5000;
        s.rounding_mode = RoundingMode::Up;
        s.store_name = "نام جدید".into();
        s.receipt_footer = "پانویس جدید".into();
        admin::update_settings(c, &s, at)?;
        admin::update_station(
            c,
            "station-1",
            &StationInput {
                name: "VIP یک".into(),
                kind: StationKind::Vip,
                rate_plan_id: "plan-vip".into(),
                enabled: true,
            },
            at,
        )
    })
    .unwrap();

    assert_eq!(repo::load_invoice(&conn, &invoice.id).unwrap(), invoice);
    assert_eq!(invoice.station_name, "ایستگاه ۱");
    assert_eq!(invoice.store_name, "گیم‌آن");
    assert_eq!(invoice.rounding_unit, 1000);
}

#[test]
fn open_sessions_keep_the_rates_agreed_at_start() {
    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    let id = start(&mut conn, "station-1", Some(2), T0);
    tx(&mut conn, |c| {
        admin::update_rate_plan(
            c,
            "plan-ps5",
            &RatePlanInput {
                name: "PS5 استاندارد".into(),
                tiers: vec![
                    RateTier { controllers: 2, hourly_rate: 500_000 },
                    RateTier { controllers: 4, hourly_rate: 900_000 },
                ],
            },
            T0 + MIN,
        )
    })
    .unwrap();
    tx(&mut conn, |c| repo::pause_session(c, &id, T0 + 30 * MIN)).unwrap();
    tx(&mut conn, |c| repo::resume_session(c, &id, T0 + 40 * MIN)).unwrap();
    tx(&mut conn, |c| repo::set_controllers(c, &id, 4, T0 + 70 * MIN)).unwrap();

    let at = T0 + 100 * MIN;
    let p = repo::preview_checkout(&conn, &id, at, at).unwrap();
    // 60 min @150k (2 ctrl) + 30 min @230k (4 ctrl) — the seed rates, not the new ones.
    assert_eq!(p.time_total, 150_000 + 115_000);
    // A *new* session on the same plan gets the new prices.
    let second = start(&mut conn, "station-2", Some(2), at);
    assert_eq!(repo::load_open_session(&conn, &second).unwrap().segments[0].hourly_rate, 500_000);
}

#[test]
fn product_price_change_mid_session_starts_a_new_line() {
    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    let id = start(&mut conn, "station-1", None, T0);
    tx(&mut conn, |c| repo::add_order_item(c, &id, "soda", T0)).unwrap();
    conn.execute("UPDATE products SET price = 30000 WHERE id = 'soda'", []).unwrap();
    tx(&mut conn, |c| repo::add_order_item(c, &id, "soda", T0)).unwrap();
    let orders = repo::load_open_session(&conn, &id).unwrap().orders;
    let prices: Vec<(i64, i64)> = orders.iter().map(|o| (o.unit_price, o.quantity)).collect();
    assert_eq!(prices, vec![(25_000, 1), (30_000, 1)]);
}

#[test]
fn admin_rules() {
    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    let vip = StationInput {
        name: "اتاق VIP ۱".into(),
        kind: StationKind::Vip,
        rate_plan_id: "plan-vip".into(),
        enabled: true,
    };
    tx(&mut conn, |c| admin::create_station(c, &vip, T0)).unwrap();
    let dup = tx(&mut conn, |c| admin::create_station(c, &vip, T0)).unwrap_err();
    assert!(matches!(dup, AppError::Validation(_)));

    start(&mut conn, "station-4", None, T0);
    let busy = tx(&mut conn, |c| admin::set_station_enabled(c, "station-4", false, T0)).unwrap_err();
    assert!(matches!(busy, AppError::Conflict(_)));
    tx(&mut conn, |c| admin::set_station_enabled(c, "station-5", false, T0)).unwrap();
    let off = tx(&mut conn, |c| repo::start_session(c, "station-5", None, T0)).unwrap_err();
    assert!(matches!(off, AppError::Conflict(_)));

    let bad_tiers = RatePlanInput {
        name: "x".into(),
        tiers: vec![RateTier { controllers: 2, hourly_rate: 1 }, RateTier { controllers: 2, hourly_rate: 2 }],
    };
    assert!(tx(&mut conn, |c| admin::create_rate_plan(c, &bad_tiers, T0)).is_err());
    let mut s = repo::load_settings(&conn).unwrap();
    s.rounding_unit = 750;
    assert!(tx(&mut conn, |c| admin::update_settings(c, &s, T0)).is_err());
}

#[test]
fn station_position_is_layout_only_and_persists() {
    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    let id = start(&mut conn, "station-1", Some(2), T0);
    let before = repo::preview_checkout(&conn, &id, T0 + HOUR, T0 + HOUR).unwrap();

    // Allowed while a session is open; negative coordinates are fine.
    tx(&mut conn, |c| admin::update_station_position(c, "station-1", 340, -25, T0 + MIN)).unwrap();
    let missing = tx(&mut conn, |c| admin::update_station_position(c, "nope", 1, 1, T0)).unwrap_err();
    assert!(matches!(missing, AppError::NotFound(_)));

    drop(conn);
    let conn = open(dir.path());
    let station = repo::load_station(&conn, "station-1").unwrap();
    assert_eq!((station.pos_x, station.pos_y), (340, -25));
    let others = repo::load_stations(&conn).unwrap();
    assert!(others.iter().filter(|s| s.id != "station-1").all(|s| (s.pos_x, s.pos_y) == (0, 0)));
    let after = repo::preview_checkout(&conn, &id, T0 + HOUR, T0 + HOUR).unwrap();
    assert_eq!(after.total, before.total, "moving a station never touches billing");
}
