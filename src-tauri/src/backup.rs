//! Local backups, export and restore.
//!
//! * Backups are complete, compacted SQLite files written with `VACUUM INTO`
//!   (a consistent snapshot even while the app is running).
//! * Files are written under a temporary name and renamed into place, so a
//!   crash never leaves a half-written backup that looks valid.
//! * Restore validates the candidate (GameOn application id, supported schema
//!   version, `integrity_check`), takes a safety backup of the current data,
//!   copies the candidate into the live connection with SQLite's online backup
//!   API, then runs pending migrations (older backups are upgraded).

use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::Connection;
use serde::Serialize;

use crate::db::{self, MIGRATIONS};
use crate::error::{AppError, AppResult};

pub const AUTO_BACKUP_KEEP: usize = 14;
/// Take an automatic backup at startup if the newest one is older than this.
pub const AUTO_BACKUP_INTERVAL_MS: i64 = 20 * 60 * 60 * 1000;
pub const BACKUP_EXTENSION: &str = "db";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum BackupKind {
    Manual,
    Auto,
    PreMigration,
    PreRestore,
}

impl BackupKind {
    fn slug(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Auto => "auto",
            Self::PreMigration => "pre-migration",
            Self::PreRestore => "pre-restore",
        }
    }

    fn from_slug(slug: &str) -> Option<Self> {
        [Self::Manual, Self::Auto, Self::PreMigration, Self::PreRestore]
            .into_iter()
            .find(|k| k.slug() == slug)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub file_name: String,
    pub path: String,
    pub kind: BackupKind,
    pub created_at: i64,
    pub size_bytes: u64,
}

// ---- UTC timestamps for file names (no date crate needed) ----------------------

fn civil_from_days(days: i64) -> (i64, i64, i64) {
    // Howard Hinnant's algorithm.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = y.div_euclid(400);
    let yoe = y.rem_euclid(400);
    let mp = if month > 2 { month - 3 } else { month + 9 };
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// `20261104-213005` (UTC)
pub fn stamp(ms: i64) -> String {
    let secs = ms.div_euclid(1000);
    let (y, m, d) = civil_from_days(secs.div_euclid(86_400));
    let rem = secs.rem_euclid(86_400);
    format!("{y:04}{m:02}{d:02}-{:02}{:02}{:02}", rem / 3600, rem % 3600 / 60, rem % 60)
}

fn parse_stamp(s: &str) -> Option<i64> {
    let (date, time) = s.split_once('-')?;
    if date.len() != 8 || time.len() != 6 {
        return None;
    }
    let n = |t: &str| t.parse::<i64>().ok();
    let days = days_from_civil(n(&date[0..4])?, n(&date[4..6])?, n(&date[6..8])?);
    let secs = days * 86_400 + n(&time[0..2])? * 3600 + n(&time[2..4])? * 60 + n(&time[4..6])?;
    Some(secs * 1000)
}

/// `gameon-20261104-213005-manual.db` → (kind, created_at)
fn parse_file_name(name: &str) -> Option<(BackupKind, i64)> {
    let rest = name.strip_prefix("gameon-")?.strip_suffix(&format!(".{BACKUP_EXTENSION}"))?;
    let (stamp_part, kind) = (rest.get(..15)?, rest.get(16..)?);
    // Kind may carry a de-duplication suffix: `manual-2`.
    let kind_slug = kind.trim_end_matches(|c: char| c.is_ascii_digit() || c == '-');
    let kind_slug = if BackupKind::from_slug(kind).is_some() { kind } else { kind_slug };
    Some((BackupKind::from_slug(kind_slug)?, parse_stamp(stamp_part)?))
}

// ---- create / list -------------------------------------------------------------

fn write_snapshot(conn: &Connection, target: &Path) -> AppResult<()> {
    let partial = target.with_extension("partial");
    let _ = fs::remove_file(&partial);
    conn.execute("VACUUM INTO ?1", [partial.to_string_lossy().as_ref()])?;
    // Verify before it becomes visible as a backup.
    validate(&partial)?;
    fs::rename(&partial, target)?;
    Ok(())
}

pub fn create_backup(conn: &Connection, dir: &Path, kind: BackupKind, now: i64) -> AppResult<BackupInfo> {
    fs::create_dir_all(dir)?;
    let base = format!("gameon-{}-{}", stamp(now), kind.slug());
    let mut path = dir.join(format!("{base}.{BACKUP_EXTENSION}"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{base}-{n}.{BACKUP_EXTENSION}"));
        n += 1;
    }
    write_snapshot(conn, &path)?;
    info_for(&path).ok_or_else(|| AppError::Internal("backup written but unreadable".into()))
}

/// Export to a path the operator chose (overwrites).
pub fn export_to(conn: &Connection, target: &Path) -> AppResult<()> {
    write_snapshot(conn, target)
}

fn info_for(path: &Path) -> Option<BackupInfo> {
    let file_name = path.file_name()?.to_string_lossy().into_owned();
    let (kind, created_at) = parse_file_name(&file_name)?;
    let size_bytes = fs::metadata(path).ok()?.len();
    Some(BackupInfo { file_name, path: path.to_string_lossy().into_owned(), kind, created_at, size_bytes })
}

pub fn list_backups(dir: &Path) -> AppResult<Vec<BackupInfo>> {
    let Ok(entries) = fs::read_dir(dir) else { return Ok(Vec::new()) };
    let mut backups: Vec<BackupInfo> = entries.filter_map(|e| info_for(&e.ok()?.path())).collect();
    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at).then_with(|| b.file_name.cmp(&a.file_name)));
    Ok(backups)
}

/// Keep the newest `keep` automatic backups; never touches other kinds.
pub fn prune_auto(dir: &Path, keep: usize) -> AppResult<usize> {
    let autos: Vec<BackupInfo> =
        list_backups(dir)?.into_iter().filter(|b| b.kind == BackupKind::Auto).collect();
    let mut removed = 0;
    for old in autos.iter().skip(keep) {
        fs::remove_file(&old.path)?;
        removed += 1;
    }
    Ok(removed)
}

/// Daily safety net, called at startup.
pub fn auto_backup_if_due(conn: &Connection, dir: &Path, now: i64) -> AppResult<Option<BackupInfo>> {
    let newest = list_backups(dir)?.into_iter().find(|b| b.kind == BackupKind::Auto);
    if newest.is_some_and(|b| now - b.created_at < AUTO_BACKUP_INTERVAL_MS) {
        return Ok(None);
    }
    let info = create_backup(conn, dir, BackupKind::Auto, now)?;
    prune_auto(dir, AUTO_BACKUP_KEEP)?;
    Ok(Some(info))
}

// ---- validate / restore --------------------------------------------------------

/// Returns the backup's schema version if it is a healthy GameOn database.
pub fn validate(path: &Path) -> AppResult<i64> {
    if !path.is_file() {
        return Err(AppError::Backup("فایل پشتیبان پیدا نشد.".into()));
    }
    let conn = db::open_read_only(path)
        .map_err(|_| AppError::Backup("فایل انتخاب‌شده پایگاه داده‌ی معتبری نیست.".into()))?;
    let version = db::check_compatible(&conn, MIGRATIONS)
        .map_err(|e| AppError::Backup(e.to_string()))
        .and_then(|v| {
            if v == 0 {
                Err(AppError::Backup("این فایل پایگاه داده‌ی گیم‌آن نیست.".into()))
            } else {
                Ok(v)
            }
        })
        .map_err(|e| match e {
            AppError::Backup(m) => AppError::Backup(m),
            _ => AppError::Backup("فایل انتخاب‌شده پایگاه داده‌ی معتبری نیست.".into()),
        })?;
    let integrity: String = conn
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(|_| AppError::Backup("فایل پشتیبان خراب است.".into()))?;
    if integrity != "ok" {
        return Err(AppError::Backup(format!("فایل پشتیبان خراب است: {integrity}")));
    }
    Ok(version)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreReport {
    pub restored_from: String,
    pub restored_version: i64,
    pub safety_backup: BackupInfo,
}

pub fn restore(
    conn: &mut Connection,
    source: &Path,
    backups_dir: &Path,
    now: i64,
) -> AppResult<RestoreReport> {
    let restored_version = validate(source)?;
    let safety_backup = create_backup(conn, backups_dir, BackupKind::PreRestore, now)?;

    {
        let src = db::open_read_only(source)?;
        let backup = rusqlite::backup::Backup::new(&src, conn)?;
        backup.run_to_completion(512, Duration::ZERO, None)?;
    }
    db::configure(conn)?;
    db::migrate(conn, MIGRATIONS)?;
    let integrity: String = conn.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
    if integrity != "ok" {
        return Err(AppError::Backup(format!(
            "بازگردانی کامل نشد ({integrity}). نسخه‌ی ایمنی: {}",
            safety_backup.file_name
        )));
    }
    Ok(RestoreReport {
        restored_from: source.to_string_lossy().into_owned(),
        restored_version,
        safety_backup,
    })
}

/// Resolve a file name from the backups list, refusing anything path-like.
pub fn resolve_in_dir(dir: &Path, file_name: &str) -> AppResult<PathBuf> {
    if file_name.contains(['/', '\\']) || file_name.contains("..") || parse_file_name(file_name).is_none() {
        return Err(AppError::Backup("نام فایل پشتیبان نامعتبر است.".into()));
    }
    Ok(dir.join(file_name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stamps_round_trip() {
        let ms = 1_793_813_401_000; // 2026-11-04T17:30:01Z
        assert_eq!(stamp(ms), "20261104-173001");
        assert_eq!(parse_stamp(&stamp(ms)), Some(ms));
        assert_eq!(stamp(0), "19700101-000000");
    }

    #[test]
    fn file_names() {
        assert_eq!(
            parse_file_name("gameon-20261104-173001-pre-restore.db"),
            Some((BackupKind::PreRestore, 1_793_813_401_000))
        );
        assert_eq!(
            parse_file_name("gameon-20261104-173001-manual-2.db").map(|p| p.0),
            Some(BackupKind::Manual)
        );
        assert_eq!(parse_file_name("notes.db"), None);
        assert!(resolve_in_dir(Path::new("/x"), "../gameon-20261104-173001-manual.db").is_err());
    }
}
