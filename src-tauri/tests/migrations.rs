//! Versioned migration strategy.

mod common;

use common::*;
use gameon_timer_lib::backup::{BackupKind, list_backups};
use gameon_timer_lib::db::{self, APPLICATION_ID, MIGRATIONS, Migration};
use gameon_timer_lib::state::open_store_with;

#[test]
fn fresh_database_migrates_to_latest_and_is_tagged() {
    let dir = temp();
    let conn = open(dir.path());
    assert_eq!(version(&conn), db::latest_version());
    assert_eq!(db::application_id(&conn).unwrap(), APPLICATION_ID);
    let mode: String = conn.query_row("PRAGMA journal_mode", [], |r| r.get(0)).unwrap();
    assert_eq!(mode, "wal");
    let fk: i64 = conn.query_row("PRAGMA foreign_keys", [], |r| r.get(0)).unwrap();
    assert_eq!(fk, 1);
    assert_eq!(count(&conn, "settings"), 1);
}

#[test]
fn reopening_applies_nothing() {
    let dir = temp();
    drop(open(dir.path()));
    let (_, info) = gameon_timer_lib::state::open_store(dir.path()).unwrap();
    assert!(info.applied_migrations.is_empty());
    assert!(info.pre_migration_backup.is_none());
}

const V1: Migration =
    Migration { version: 1, name: "t", sql: "CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (42);" };
const V2: Migration =
    Migration { version: 2, name: "add y", sql: "ALTER TABLE t ADD COLUMN y TEXT NOT NULL DEFAULT 'ok';" };
const V2_BROKEN: Migration = Migration {
    version: 2,
    name: "broken",
    sql: "ALTER TABLE t ADD COLUMN y TEXT; INSERT INTO does_not_exist VALUES (1);",
};

#[test]
fn upgrade_preserves_data_and_takes_a_pre_migration_backup() {
    let dir = temp();
    drop(open_store_with(dir.path(), &[V1]).unwrap());

    let (conn, info) = open_store_with(dir.path(), &[V1, V2]).unwrap();
    assert_eq!(info.applied_migrations, vec![2]);
    assert_eq!(info.migrated_from, Some(1));
    assert_eq!(version(&conn), 2);
    let row: (i64, String) =
        conn.query_row("SELECT x, y FROM t", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
    assert_eq!(row, (42, "ok".into()));

    let backup = info.pre_migration_backup.expect("pre-migration backup");
    assert_eq!(backup.kind, BackupKind::PreMigration);
    let old = db::open_read_only(std::path::Path::new(&backup.path)).unwrap();
    assert_eq!(version(&old), 1, "backup holds the pre-upgrade schema");
}

#[test]
fn failed_migration_rolls_back_completely() {
    let dir = temp();
    drop(open_store_with(dir.path(), &[V1]).unwrap());

    assert!(open_store_with(dir.path(), &[V1, V2_BROKEN]).is_err());
    let conn = db::open(&dir.path().join("gameon.db")).unwrap();
    assert_eq!(version(&conn), 1, "version not bumped");
    let has_y: bool = conn
        .query_row("SELECT EXISTS (SELECT 1 FROM pragma_table_info('t') WHERE name = 'y')", [], |r| r.get(0))
        .unwrap();
    assert!(!has_y, "partial DDL rolled back");
    // The pre-migration backup was still taken before the attempt.
    assert!(
        list_backups(&dir.path().join("backups")).unwrap().iter().any(|b| b.kind == BackupKind::PreMigration)
    );
}

#[test]
fn refuses_newer_or_foreign_databases() {
    let dir = temp();
    {
        let conn = open(dir.path());
        conn.pragma_update(None, "user_version", 999).unwrap();
    }
    let err = gameon_timer_lib::state::open_store(dir.path()).expect_err("newer schema refused");
    assert!(err.to_string().contains("جدیدتر"), "{err}");

    let foreign = temp();
    {
        let conn = rusqlite::Connection::open(foreign.path().join("gameon.db")).unwrap();
        conn.execute_batch("CREATE TABLE other (a); PRAGMA user_version = 1;").unwrap();
    }
    assert!(gameon_timer_lib::state::open_store(foreign.path()).is_err());
}

#[test]
fn migration_versions_are_strictly_increasing() {
    assert!(MIGRATIONS.windows(2).all(|w| w[0].version < w[1].version));
    assert_eq!(MIGRATIONS[0].version, 1);
}

/// A v1 database (first SQLite release) seeded with data, as found on a store PC.
fn v1_store(dir: &std::path::Path) {
    let (conn, _) = open_store_with(dir, &MIGRATIONS[..1]).unwrap();
    seed_like_v1(&conn);
    assert_eq!(version(&conn), 1);
}

#[test]
fn real_upgrade_from_v1_applies_every_later_migration() {
    let dir = temp();
    v1_store(dir.path());

    let (conn, info) = gameon_timer_lib::state::open_store(dir.path()).unwrap();
    assert_eq!(info.migrated_from, Some(1));
    assert_eq!(info.applied_migrations, (2..=db::latest_version()).collect::<Vec<_>>());
    assert!(info.pre_migration_backup.is_some(), "backup taken before the upgrade");
    assert_eq!(version(&conn), db::latest_version());

    let stations = gameon_timer_lib::repo::load_stations(&conn).unwrap();
    assert_eq!(stations.len(), 10, "existing stations kept");
    assert!(stations.iter().all(|s| (s.pos_x, s.pos_y) == (0, 0)), "defaults applied");
}

#[test]
fn restoring_a_v1_backup_upgrades_it() {
    let old = temp();
    v1_store(old.path());
    let file = old.path().join("v1-export.db");
    {
        let conn = db::open(&old.path().join("gameon.db")).unwrap();
        gameon_timer_lib::backup::export_to(&conn, &file).unwrap();
    }

    let dir = temp();
    let (mut conn, _) = seeded(dir.path());
    gameon_timer_lib::backup::restore(&mut conn, &file, &dir.path().join("backups"), T0).unwrap();
    assert_eq!(version(&conn), db::latest_version());
    assert_eq!(gameon_timer_lib::repo::load_floor(&conn).unwrap().stations.len(), 10);
}
