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
