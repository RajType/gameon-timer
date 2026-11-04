//! One-time import of first-release localStorage data.
//! Fixture: a real `gameon:floor` payload captured from the previous version.

mod common;

use common::*;
use gameon_timer_lib::bootstrap::{self, LegacyStatus};
use gameon_timer_lib::{billing, legacy, repo};
use serde_json::Value;

fn legacy_json() -> Value {
    serde_json::from_str(LEGACY_FIXTURE).unwrap()
}

/// The old app's exact formula (`src/lib/billing.ts` of v0.1.0).
fn legacy_total(session: &Value, now: i64) -> (i64, i64) {
    let started = session["startedAt"].as_i64().unwrap();
    let paused_ms = session["pausedMs"].as_i64().unwrap();
    let end = session["pausedAt"].as_i64().unwrap_or(now);
    let played = (end - started - paused_ms).max(0);
    let rate = session["hourlyRate"].as_i64().unwrap() as f64;
    let time_cost = ((played as f64 / 3_600_000.0) * rate).round() as i64;
    let buffet: i64 = session["buffet"]
        .as_array()
        .unwrap()
        .iter()
        .map(|l| l["unitPrice"].as_i64().unwrap() * l["quantity"].as_i64().unwrap())
        .sum();
    let subtotal = time_cost + buffet;
    (time_cost, ((subtotal as f64 / 1000.0).round() as i64) * 1000)
}

#[test]
fn imports_the_captured_payload_faithfully() {
    let dir = temp();
    let mut conn = open(dir.path());
    let now = T0 + 3 * HOUR;
    let boot = bootstrap::bootstrap(&mut conn, Some(LEGACY_FIXTURE), now).unwrap();
    assert_eq!(boot.legacy.status, LegacyStatus::Imported);
    assert!(boot.initialized);
    let summary = boot.legacy.summary.unwrap();
    assert_eq!(
        (summary.stations, summary.rate_plans, summary.open_sessions, summary.invoices),
        (10, 2, 2, 2)
    );
    assert!(summary.warnings.is_empty(), "{:?}", summary.warnings);

    let old = legacy_json();
    let state = &old["state"];

    // Stations: same ids, names, kinds and order.
    let ids: Vec<&str> = boot.floor.stations.iter().map(|s| s.id.as_str()).collect();
    let old_ids: Vec<&str> =
        state["stations"].as_array().unwrap().iter().map(|s| s["id"].as_str().unwrap()).collect();
    assert_eq!(ids, old_ids);
    assert_eq!(boot.floor.stations[0].name, "ایستگاه ۱");

    // Closed invoices: identical numbers and amounts; internally consistent.
    for old_inv in state["invoices"].as_array().unwrap() {
        let inv = repo::load_invoice(&conn, old_inv["id"].as_str().unwrap()).unwrap();
        assert_eq!(inv.source, "legacy");
        for (field, value) in [
            ("number", inv.number),
            ("total", inv.total),
            ("subtotal", inv.subtotal),
            ("rounding", inv.rounding),
            ("timeCost", inv.time_total),
            ("buffetTotal", inv.orders_total),
            ("playedMs", inv.played_ms),
        ] {
            assert_eq!(value, old_inv[field].as_i64().unwrap(), "invoice {} {field}", inv.number);
        }
        billing::verify_invoice(&inv).unwrap();
    }
    assert_eq!(repo::next_invoice_number(&conn).unwrap(), state["nextInvoiceNumber"].as_i64().unwrap());

    // Open sessions bill exactly as the old app would, at any moment.
    for (station_id, old_session) in state["sessions"].as_object().unwrap() {
        let session = boot.floor.sessions.iter().find(|s| &s.station_id == station_id).unwrap();
        assert_eq!(session.id, old_session["id"].as_str().unwrap());
        assert_eq!(session.started_at, old_session["startedAt"].as_i64().unwrap(), "display start kept");
        let paused = !old_session["pausedAt"].is_null();
        assert_eq!(session.open_segment().is_none(), paused);
        for step in 0..200 {
            let at = session.started_at + 3 * HOUR + step * 7_919;
            let preview = repo::preview_checkout(&conn, &session.id, at, at).unwrap();
            let (time_cost, total) = legacy_total(old_session, at);
            assert_eq!((preview.time_total, preview.total), (time_cost, total), "{station_id} at +{step}");
        }
    }
}

#[test]
fn same_payload_is_never_imported_twice() {
    let dir = temp();
    let mut conn = open(dir.path());
    bootstrap::bootstrap(&mut conn, Some(LEGACY_FIXTURE), T0).unwrap();
    let before = (
        count(&conn, "stations"),
        count(&conn, "sessions"),
        count(&conn, "invoices"),
        count(&conn, "order_items"),
    );

    // Startup again with the key still present (e.g. clean-up never ran).
    for _ in 0..3 {
        let again = bootstrap::bootstrap(&mut conn, Some(LEGACY_FIXTURE), T0 + HOUR).unwrap();
        assert_eq!(again.legacy.status, LegacyStatus::AlreadyImported);
    }
    // Restart of the whole app, too.
    drop(conn);
    let mut conn = open(dir.path());
    assert_eq!(
        bootstrap::bootstrap(&mut conn, Some(LEGACY_FIXTURE), T0).unwrap().legacy.status,
        LegacyStatus::AlreadyImported
    );

    let after = (
        count(&conn, "stations"),
        count(&conn, "sessions"),
        count(&conn, "invoices"),
        count(&conn, "order_items"),
    );
    assert_eq!(before, after);
    assert_eq!(count(&conn, "legacy_imports"), 1);
    // The unique index forbids a second 'imported' row even if code tried.
    let hash = legacy::payload_hash(LEGACY_FIXTURE);
    assert!(conn
        .execute(
            "INSERT INTO legacy_imports (payload_hash, payload, status, detail, created_at) VALUES (?1, '', 'imported', '', 0)",
            [&hash]
        )
        .is_err());
}

#[test]
fn different_payload_after_initialisation_is_kept_but_not_merged() {
    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    let stations = count(&conn, "stations");
    for _ in 0..2 {
        let boot = bootstrap::bootstrap(&mut conn, Some(LEGACY_FIXTURE), T0).unwrap();
        assert_eq!(boot.legacy.status, LegacyStatus::Skipped);
    }
    assert_eq!(count(&conn, "stations"), stations, "no merge into existing data");
    assert_eq!(count(&conn, "invoices"), 0);
    let stored: String = conn
        .query_row("SELECT payload FROM legacy_imports WHERE status = 'skipped'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(stored, LEGACY_FIXTURE, "raw payload preserved exactly, once");
}

#[test]
fn inconsistent_payload_fails_atomically_and_is_preserved() {
    let mut tampered = legacy_json();
    tampered["state"]["invoices"][0]["total"] = Value::from(1_000_000);
    let payload = serde_json::to_string(&tampered).unwrap();

    let dir = temp();
    let mut conn = open(dir.path());
    let boot = bootstrap::bootstrap(&mut conn, Some(&payload), T0).unwrap();
    assert_eq!(boot.legacy.status, LegacyStatus::Failed);
    assert!(boot.legacy.error.unwrap().contains("فاکتور"));
    assert!(!boot.initialized, "nothing seeded over the operator's data");
    for table in ["stations", "rate_plans", "sessions", "invoices", "products"] {
        assert_eq!(count(&conn, table), 0, "{table} rolled back");
    }
    let (status, stored): (String, String) = conn
        .query_row("SELECT status, payload FROM legacy_imports", [], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap();
    assert_eq!((status.as_str(), stored.as_str()), ("failed", payload.as_str()));

    // Retrying is allowed (failed ≠ imported) and fails the same way.
    assert_eq!(
        bootstrap::bootstrap(&mut conn, Some(&payload), T0).unwrap().legacy.status,
        LegacyStatus::Failed
    );
    assert_eq!(count(&conn, "legacy_imports"), 1);

    // Operator continues without the old data: defaults, payload still kept.
    let boot = bootstrap::skip_legacy(&mut conn, &payload, T0).unwrap();
    assert!(boot.initialized);
    assert_eq!(boot.floor.stations.len(), 10);
    assert_eq!(count(&conn, "legacy_imports"), 2);
}

#[test]
fn garbage_payload_fails_cleanly() {
    let dir = temp();
    let mut conn = open(dir.path());
    for payload in ["not json", "{\"state\":{},\"version\":1}", "{\"state\":{\"stations\":[]},\"version\":2}"]
    {
        let boot = bootstrap::bootstrap(&mut conn, Some(payload), T0).unwrap();
        assert_eq!(boot.legacy.status, LegacyStatus::Failed, "{payload}");
        assert!(!boot.initialized);
    }
}

#[test]
fn imported_sessions_continue_normally() {
    let dir = temp();
    let mut conn = open(dir.path());
    let boot = bootstrap::bootstrap(&mut conn, Some(LEGACY_FIXTURE), T0).unwrap();
    let paused = boot.floor.sessions.iter().find(|s| s.open_segment().is_none()).unwrap().id.clone();
    let now = T0 + 4 * HOUR;
    tx(&mut conn, |c| repo::resume_session(c, &paused, now)).unwrap();
    tx(&mut conn, |c| repo::add_order_item(c, &paused, "water", 1, now)).unwrap();
    let at = now + 30 * MIN;
    let p = repo::preview_checkout(&conn, &paused, at, at).unwrap();
    let invoice = tx(&mut conn, |c| repo::checkout(c, &paused, at, Some(p.total), at)).unwrap();
    assert_eq!(invoice.number, 3, "numbering continues after legacy invoices");
    billing::verify_invoice(&invoice).unwrap();
}
