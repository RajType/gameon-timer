//! Startup decision: seed defaults, import legacy data, or carry on.

use rusqlite::Connection;
use serde::Serialize;

use crate::error::AppResult;
use crate::legacy::{self, ImportSummary};
use crate::models::{Catalog, Floor, Settings};
use crate::repo::{is_initialized, load_catalog, load_floor, load_settings};
use crate::seed;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LegacyStatus {
    /// No legacy payload was offered.
    None,
    /// Imported now.
    Imported,
    /// This exact payload was imported earlier; nothing written.
    AlreadyImported,
    /// Database already had data; payload stored for reference, not merged.
    Skipped,
    /// Import failed; database left uninitialised, payload stored.
    Failed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyOutcome {
    pub status: LegacyStatus,
    pub hash: Option<String>,
    pub summary: Option<ImportSummary>,
    pub error: Option<String>,
}

impl LegacyOutcome {
    pub fn none_public() -> Self {
        Self::none()
    }

    fn none() -> Self {
        Self { status: LegacyStatus::None, hash: None, summary: None, error: None }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub initialized: bool,
    pub floor: Floor,
    pub catalog: Catalog,
    pub settings: Settings,
    pub legacy: LegacyOutcome,
}

pub fn snapshot(conn: &Connection, legacy: LegacyOutcome) -> AppResult<Bootstrap> {
    Ok(Bootstrap {
        initialized: is_initialized(conn)?,
        floor: load_floor(conn)?,
        catalog: load_catalog(conn)?,
        settings: load_settings(conn)?,
        legacy,
    })
}

pub fn bootstrap(conn: &mut Connection, legacy_payload: Option<&str>, now: i64) -> AppResult<Bootstrap> {
    let initialized = is_initialized(conn)?;
    let legacy = match (initialized, legacy_payload) {
        (false, None) => {
            let tx = conn.transaction()?;
            seed::seed_defaults(&tx, now)?;
            tx.commit()?;
            LegacyOutcome::none()
        }
        (true, None) => LegacyOutcome::none(),
        (_, Some(payload)) => {
            let hash = legacy::payload_hash(payload);
            if legacy::imported_at(conn, &hash)?.is_some() {
                LegacyOutcome {
                    status: LegacyStatus::AlreadyImported,
                    hash: Some(hash),
                    summary: None,
                    error: None,
                }
            } else if initialized {
                let tx = conn.transaction()?;
                legacy::record(&tx, &hash, payload, "skipped", "database already initialised", now)?;
                tx.commit()?;
                LegacyOutcome { status: LegacyStatus::Skipped, hash: Some(hash), summary: None, error: None }
            } else {
                let tx = conn.transaction()?;
                match legacy::import(&tx, payload, now) {
                    Ok(summary) => {
                        legacy::record(
                            &tx,
                            &hash,
                            payload,
                            "imported",
                            &serde_json::to_string(&summary)?,
                            now,
                        )?;
                        tx.commit()?;
                        LegacyOutcome {
                            status: LegacyStatus::Imported,
                            hash: Some(hash),
                            summary: Some(summary),
                            error: None,
                        }
                    }
                    Err(error) => {
                        tx.rollback()?;
                        let message = error.to_string();
                        let tx = conn.transaction()?;
                        legacy::record(&tx, &hash, payload, "failed", &message, now)?;
                        tx.commit()?;
                        LegacyOutcome {
                            status: LegacyStatus::Failed,
                            hash: Some(hash),
                            summary: None,
                            error: Some(message),
                        }
                    }
                }
            }
        }
    };
    snapshot(conn, legacy)
}

/// Operator chose to continue without the old data after a failed import.
/// The payload stays in `legacy_imports`; defaults are seeded.
pub fn skip_legacy(conn: &mut Connection, payload: &str, now: i64) -> AppResult<Bootstrap> {
    let hash = legacy::payload_hash(payload);
    let tx = conn.transaction()?;
    legacy::record(&tx, &hash, payload, "skipped", "operator continued without import", now)?;
    if !is_initialized(&tx)? {
        seed::seed_defaults(&tx, now)?;
    }
    tx.commit()?;
    snapshot(
        conn,
        LegacyOutcome { status: LegacyStatus::Skipped, hash: Some(hash), summary: None, error: None },
    )
}
