#![allow(dead_code)]

use std::path::Path;

use gameon_timer_lib::bootstrap::{self, Bootstrap};
use gameon_timer_lib::db;
use gameon_timer_lib::state;
use rusqlite::Connection;

pub const MIN: i64 = 60_000;
pub const HOUR: i64 = 60 * MIN;
/// 2026-11-04T17:30:00Z
pub const T0: i64 = 1_793_813_400_000;

pub const LEGACY_FIXTURE: &str = include_str!("../fixtures/legacy-v1.json");

pub fn temp() -> tempfile::TempDir {
    tempfile::tempdir().expect("temp dir")
}

pub fn open(dir: &Path) -> Connection {
    state::open_store(dir).expect("open store").0
}

/// Fresh store with default seed data.
pub fn seeded(dir: &Path) -> (Connection, Bootstrap) {
    let mut conn = open(dir);
    let boot = bootstrap::bootstrap(&mut conn, None, T0).expect("bootstrap");
    (conn, boot)
}

pub fn count(conn: &Connection, table: &str) -> i64 {
    conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0)).unwrap()
}

pub fn version(conn: &Connection) -> i64 {
    db::schema_version(conn).unwrap()
}

/// Run `f` in a transaction and commit — mirrors `commands.rs`.
pub fn tx<T>(
    conn: &mut Connection,
    f: impl FnOnce(&Connection) -> gameon_timer_lib::error::AppResult<T>,
) -> gameon_timer_lib::error::AppResult<T> {
    let tx = conn.transaction().unwrap();
    let out = f(&tx)?;
    tx.commit().unwrap();
    Ok(out)
}

/// Seed a database at schema v1–v3 the way those versions did (raw SQL, old
/// column set — e.g. the `products.category` text column). Upgrade tests must
/// not use today's seed code on an old schema.
pub fn seed_like_v1(conn: &Connection) {
    conn.execute_batch(
        "INSERT INTO rate_plans (id, name, created_at, updated_at) VALUES ('plan-ps5', 'PS5 استاندارد', 0, 0);
         INSERT INTO rate_plan_tiers VALUES ('plan-ps5', 1, 150000), ('plan-ps5', 2, 150000);
         INSERT INTO products (id, name, category, price, active, sort_order, created_at, updated_at) VALUES
           ('water', 'آب معدنی', 'drink', 10000, 1, 0, 0, 0),
           ('soda', 'نوشابه', 'drink', 25000, 1, 1, 0, 0),
           ('chips', 'چیپس', 'snack', 30000, 1, 2, 0, 0),
           ('sandwich', 'ساندویچ', 'food', 120000, 1, 3, 0, 0);
         INSERT INTO meta (key, value) VALUES ('initialized_at', '0');",
    )
    .unwrap();
    for i in 1..=10 {
        conn.execute(
            "INSERT INTO stations (id, name, kind, rate_plan_id, enabled, sort_order, created_at, updated_at)
             VALUES (?1, ?2, 'ps5', 'plan-ps5', 1, ?3, 0, 0)",
            rusqlite::params![format!("station-{i}"), format!("ایستگاه {i}"), i],
        )
        .unwrap();
    }
}
