//! Process-wide state: one SQLite connection behind a mutex, opened and
//! migrated at startup. Startup failures are kept (not panicked) so the UI can
//! show the operator what went wrong.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use rusqlite::Connection;
use serde::Serialize;

use crate::backup::{self, BackupInfo, BackupKind};
use crate::db::{self, MIGRATIONS, Migration, MigrationReport};
use crate::error::{AppError, AppResult};
use crate::repo::now_ms;

pub const DB_FILE_NAME: &str = "gameon.db";

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupInfo {
    pub migrated_from: Option<i64>,
    pub applied_migrations: Vec<i64>,
    pub pre_migration_backup: Option<BackupInfo>,
    pub auto_backup: Option<BackupInfo>,
    pub warnings: Vec<String>,
}

pub struct AppState {
    conn: Mutex<Option<Connection>>,
    startup_error: Option<String>,
    pub db_path: PathBuf,
    pub backups_dir: PathBuf,
    pub startup: StartupInfo,
}

impl AppState {
    pub fn db(&self) -> AppResult<MutexGuard<'_, Option<Connection>>> {
        if let Some(message) = &self.startup_error {
            return Err(AppError::Internal(message.clone()));
        }
        self.conn.lock().map_err(|_| AppError::Internal("database lock poisoned".into()))
    }
}

/// Open the database in `data_dir`, back it up if a schema upgrade is
/// pending, migrate, and take the daily automatic backup.
pub fn open_store(data_dir: &Path) -> AppResult<(Connection, StartupInfo)> {
    open_store_with(data_dir, MIGRATIONS)
}

/// [`open_store`] with an explicit migration list (tests exercise upgrades).
pub fn open_store_with(data_dir: &Path, migrations: &[Migration]) -> AppResult<(Connection, StartupInfo)> {
    std::fs::create_dir_all(data_dir)?;
    let backups_dir = data_dir.join("backups");
    let mut conn = db::open(&data_dir.join(DB_FILE_NAME))?;
    let mut info = StartupInfo::default();

    let version = db::check_compatible(&conn, migrations)?;
    let latest = migrations.last().map_or(0, |m| m.version);
    if version > 0 && version < latest {
        info.pre_migration_backup =
            Some(backup::create_backup(&conn, &backups_dir, BackupKind::PreMigration, now_ms())?);
    }
    let report: MigrationReport = db::migrate(&mut conn, migrations)?;
    if !report.applied.is_empty() && report.from > 0 {
        info.migrated_from = Some(report.from);
    }
    info.applied_migrations = report.applied;

    // A failed automatic backup must never stop the store from opening.
    match backup::auto_backup_if_due(&conn, &backups_dir, now_ms()) {
        Ok(created) => info.auto_backup = created,
        Err(e) => info.warnings.push(format!("پشتیبان خودکار ساخته نشد: {e}")),
    }
    Ok((conn, info))
}

pub fn init(data_dir: &Path) -> AppState {
    let db_path = data_dir.join(DB_FILE_NAME);
    let backups_dir = data_dir.join("backups");
    match open_store(data_dir) {
        Ok((conn, startup)) => {
            AppState { conn: Mutex::new(Some(conn)), startup_error: None, db_path, backups_dir, startup }
        }
        Err(e) => AppState {
            conn: Mutex::new(None),
            startup_error: Some(format!("پایگاه داده باز نشد: {e}")),
            db_path,
            backups_dir,
            startup: StartupInfo::default(),
        },
    }
}
