//! Backup, export and restore.

mod common;

use common::*;
use gameon_timer_lib::backup::{self, AUTO_BACKUP_INTERVAL_MS, AUTO_BACKUP_KEEP, BackupKind};
use gameon_timer_lib::{db, repo};

#[test]
fn restore_brings_back_exactly_the_backed_up_state() {
    let dir = temp();
    let backups = dir.path().join("backups");
    let (mut conn, _) = seeded(dir.path());
    let id = tx(&mut conn, |c| repo::start_session(c, "station-1", Some(2), T0)).unwrap();
    tx(&mut conn, |c| repo::add_order_item(c, &id, "soda", 1, T0)).unwrap();
    let snapshot_floor = repo::load_floor(&conn).unwrap();
    let saved = backup::create_backup(&conn, &backups, BackupKind::Manual, T0 + MIN).unwrap();
    assert_eq!(saved.kind, BackupKind::Manual);
    assert!(saved.size_bytes > 0);

    // Business continues after the backup...
    let at = T0 + HOUR;
    let total = repo::preview_checkout(&conn, &id, at, at).unwrap().total;
    tx(&mut conn, |c| repo::checkout(c, &id, at, Some(total), at)).unwrap();
    tx(&mut conn, |c| repo::start_session(c, "station-2", None, at)).unwrap();
    assert_eq!(count(&conn, "invoices"), 1);

    // ...then the operator restores.
    let report = backup::restore(&mut conn, std::path::Path::new(&saved.path), &backups, at + MIN).unwrap();
    assert_eq!(repo::load_floor(&conn).unwrap(), snapshot_floor);
    assert_eq!(count(&conn, "invoices"), 0);

    // Nothing is lost: the pre-restore safety copy holds the invoice.
    assert_eq!(report.safety_backup.kind, BackupKind::PreRestore);
    let safety = db::open_read_only(std::path::Path::new(&report.safety_backup.path)).unwrap();
    assert_eq!(count(&safety, "invoices"), 1);

    // The live database keeps working and survives a reopen.
    tx(&mut conn, |c| repo::pause_session(c, &id, at + 2 * MIN)).unwrap();
    drop(conn);
    let conn = open(dir.path());
    assert_eq!(repo::load_floor(&conn).unwrap().sessions.len(), 1);
    let mode: String = conn.query_row("PRAGMA journal_mode", [], |r| r.get(0)).unwrap();
    assert_eq!(mode, "wal");
}

#[test]
fn restore_refuses_bad_files_and_leaves_data_untouched() {
    let dir = temp();
    let backups = dir.path().join("backups");
    let (mut conn, _) = seeded(dir.path());
    tx(&mut conn, |c| repo::start_session(c, "station-1", None, T0)).unwrap();
    let before = repo::load_floor(&conn).unwrap();
    let junk = temp();

    let text = junk.path().join("notes.db");
    std::fs::write(&text, "hello").unwrap();

    let foreign = junk.path().join("foreign.db");
    rusqlite::Connection::open(&foreign)
        .unwrap()
        .execute_batch("CREATE TABLE x (a); PRAGMA user_version = 1;")
        .unwrap();

    let newer = junk.path().join("newer.db");
    backup::export_to(&conn, &newer).unwrap();
    rusqlite::Connection::open(&newer).unwrap().pragma_update(None, "user_version", 99).unwrap();

    let truncated = junk.path().join("truncated.db");
    backup::export_to(&conn, &truncated).unwrap();
    let bytes = std::fs::read(&truncated).unwrap();
    std::fs::write(&truncated, &bytes[..bytes.len() / 2]).unwrap();

    let missing = junk.path().join("missing.db");

    for bad in [&text, &foreign, &newer, &truncated, &missing] {
        let err = backup::restore(&mut conn, bad, &backups, T0).unwrap_err();
        assert!(!err.to_string().is_empty(), "{}", bad.display());
        assert_eq!(repo::load_floor(&conn).unwrap(), before, "{} must not change data", bad.display());
    }
    assert!(
        backup::list_backups(&backups).unwrap().iter().all(|b| b.kind != BackupKind::PreRestore),
        "no safety backup taken for a rejected file"
    );
}

#[test]
fn automatic_backups_are_daily_and_pruned() {
    let dir = temp();
    let backups = dir.path().join("backups");
    let (conn, _) = seeded(dir.path());
    // Startup already took one (real clock); start from a clean folder.
    std::fs::remove_dir_all(&backups).ok();

    assert!(backup::auto_backup_if_due(&conn, &backups, T0).unwrap().is_some());
    assert!(backup::auto_backup_if_due(&conn, &backups, T0 + HOUR).unwrap().is_none(), "not due yet");
    for day in 1..=20 {
        backup::auto_backup_if_due(&conn, &backups, T0 + day * (AUTO_BACKUP_INTERVAL_MS + MIN)).unwrap();
    }
    backup::create_backup(&conn, &backups, BackupKind::Manual, T0).unwrap();
    let all = backup::list_backups(&backups).unwrap();
    assert_eq!(all.iter().filter(|b| b.kind == BackupKind::Auto).count(), AUTO_BACKUP_KEEP);
    assert_eq!(all.iter().filter(|b| b.kind == BackupKind::Manual).count(), 1, "manual backups never pruned");
    assert!(all.windows(2).all(|w| w[0].created_at >= w[1].created_at), "newest first");
}

#[test]
fn export_overwrites_and_backups_are_valid_databases() {
    let dir = temp();
    let (conn, _) = seeded(dir.path());
    let out = temp();
    let target = out.path().join("export.db");
    std::fs::write(&target, "old contents").unwrap();
    backup::export_to(&conn, &target).unwrap();
    assert_eq!(backup::validate(&target).unwrap(), db::latest_version());
    assert!(!out.path().join("export.partial").exists(), "temp file cleaned up");

    let backups = dir.path().join("backups");
    let a = backup::create_backup(&conn, &backups, BackupKind::Manual, T0).unwrap();
    let b = backup::create_backup(&conn, &backups, BackupKind::Manual, T0).unwrap();
    assert_ne!(a.file_name, b.file_name, "same-second backups do not collide");
    std::fs::write(backups.join("gameon-20261104-173000-manual.partial"), "x").unwrap();
    assert!(backup::list_backups(&backups).unwrap().iter().all(|b| b.file_name.ends_with(".db")));
}
