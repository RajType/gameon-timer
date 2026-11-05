//! Connection setup and the versioned migration runner.
//!
//! Strategy: every schema change is a numbered SQL file applied exactly once,
//! in order, inside its own transaction. `PRAGMA user_version` records the
//! last applied version, so a crash mid-migration leaves the previous version
//! intact. Databases are tagged with `PRAGMA application_id` so a random
//! SQLite file can never be "restored" over the store's data.

use std::path::Path;

use rusqlite::{Connection, OpenFlags};

use crate::error::{AppError, AppResult};

/// "GMON" — identifies GameOn databases and backups.
pub const APPLICATION_ID: i32 = 0x474D_4F4E;

pub struct Migration {
    pub version: i64,
    pub name: &'static str,
    pub sql: &'static str,
}

pub const MIGRATIONS: &[Migration] = &[
    Migration { version: 1, name: "init", sql: include_str!("../migrations/0001_init.sql") },
    Migration {
        version: 2,
        name: "add station positions",
        sql: include_str!("../migrations/0002_add_station_positions.sql"),
    },
    Migration { version: 3, name: "buffet stock", sql: include_str!("../migrations/0003_buffet_stock.sql") },
    Migration {
        version: 4,
        name: "branding and categories",
        sql: include_str!("../migrations/0004_branding_categories.sql"),
    },
];

pub fn latest_version() -> i64 {
    MIGRATIONS.last().map_or(0, |m| m.version)
}

/// Open (creating if needed) a read-write database with production pragmas.
pub fn open(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    configure(&conn)?;
    Ok(conn)
}

pub fn open_read_only(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    Ok(conn)
}

/// WAL for concurrency, `synchronous=FULL` so a committed checkout survives a
/// power cut, and foreign keys on (they are off by default in SQLite).
pub fn configure(conn: &Connection) -> AppResult<()> {
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "FULL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    Ok(())
}

pub fn schema_version(conn: &Connection) -> AppResult<i64> {
    Ok(conn.pragma_query_value(None, "user_version", |row| row.get(0))?)
}

pub fn application_id(conn: &Connection) -> AppResult<i32> {
    Ok(conn.pragma_query_value(None, "application_id", |row| row.get(0))?)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MigrationReport {
    pub from: i64,
    pub to: i64,
    pub applied: Vec<i64>,
}

/// Refuse files that are not ours, or that come from a newer app version.
pub fn check_compatible(conn: &Connection, migrations: &[Migration]) -> AppResult<i64> {
    let version = schema_version(conn)?;
    let app_id = application_id(conn)?;
    let latest = migrations.last().map_or(0, |m| m.version);
    if version > 0 && app_id != APPLICATION_ID {
        return Err(AppError::Backup("این فایل پایگاه داده‌ی گیم‌آن نیست.".into()));
    }
    if version > latest {
        return Err(AppError::Backup(format!(
            "این پایگاه داده با نسخه‌ی جدیدتری از برنامه ساخته شده است (نسخه‌ی طرح‌واره {version})."
        )));
    }
    Ok(version)
}

/// Apply every pending migration, each atomically.
pub fn migrate(conn: &mut Connection, migrations: &[Migration]) -> AppResult<MigrationReport> {
    debug_assert!(migrations.windows(2).all(|w| w[0].version < w[1].version));
    let from = check_compatible(conn, migrations)?;
    let mut applied = Vec::new();

    for migration in migrations.iter().filter(|m| m.version > from) {
        let tx = conn.transaction()?;
        tx.execute_batch(migration.sql).map_err(|e| {
            AppError::Internal(format!("migration {} ({}) failed: {e}", migration.version, migration.name))
        })?;
        tx.pragma_update(None, "application_id", APPLICATION_ID)?;
        tx.pragma_update(None, "user_version", migration.version)?;
        tx.commit()?;
        applied.push(migration.version);
    }

    let to = schema_version(conn)?;
    Ok(MigrationReport { from, to, applied })
}
