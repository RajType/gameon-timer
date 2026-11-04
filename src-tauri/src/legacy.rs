//! One-time import of the first release's data from WebView localStorage
//! (zustand `persist`, key `gameon:floor`, version 1).
//!
//! Guarantees
//!   * Atomic: runs inside the caller's transaction — all or nothing.
//!   * Lossless: the raw payload is stored in `legacy_imports` whatever the
//!     outcome, so it travels with every backup.
//!   * Idempotent: a payload (by SHA-256) is imported at most once
//!     (`legacy_imports_once` unique index).
//!   * Faithful: open sessions bill exactly as the old app would have, and
//!     closed invoices keep their original numbers and amounts.

use std::collections::{BTreeMap, HashMap, HashSet};

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::billing::apply_rounding;
use crate::error::{AppResult, validation};
use crate::fa;
use crate::models::{RoundingMode, RoundingRule, StationKind};
use crate::repo::{load_settings, mark_initialized, meta_set};
use crate::seed;

pub const LEGACY_STORAGE_KEY: &str = "gameon:floor";
/// The old app had flat pricing; every controller count gets the old rate.
const LEGACY_CONTROLLER_TIERS: std::ops::RangeInclusive<i64> = 1..=4;
/// The old app always rounded totals to the nearest 1,000.
const LEGACY_ROUNDING: RoundingRule = RoundingRule { unit: 1000, mode: RoundingMode::Nearest };

#[derive(Deserialize)]
struct Envelope {
    state: LegacyState,
    version: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyState {
    stations: Vec<LegacyStation>,
    #[serde(default)]
    sessions: BTreeMap<String, LegacySession>,
    #[serde(default)]
    invoices: Vec<LegacyInvoice>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyStation {
    id: String,
    name: String,
    kind: String,
    hourly_rate: i64,
    #[serde(default)]
    out_of_service: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacySession {
    id: String,
    station_id: String,
    started_at: i64,
    paused_at: Option<i64>,
    paused_ms: i64,
    hourly_rate: i64,
    #[serde(default)]
    buffet: Vec<LegacyLine>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyLine {
    item_id: String,
    name: String,
    unit_price: i64,
    quantity: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyInvoice {
    id: String,
    number: i64,
    session_id: String,
    station_id: String,
    station_name: String,
    started_at: i64,
    ended_at: i64,
    played_ms: i64,
    paused_ms: i64,
    hourly_rate: i64,
    time_cost: i64,
    #[serde(default)]
    buffet: Vec<LegacyLine>,
    buffet_total: i64,
    subtotal: i64,
    rounding: i64,
    total: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub stations: usize,
    pub rate_plans: usize,
    pub open_sessions: usize,
    pub invoices: usize,
    pub order_lines: usize,
    pub warnings: Vec<String>,
}

pub fn payload_hash(payload: &str) -> String {
    let digest = Sha256::digest(payload.as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// Has exactly this payload already been imported?
pub fn imported_at(conn: &Connection, hash: &str) -> AppResult<Option<i64>> {
    Ok(conn
        .query_row(
            "SELECT created_at FROM legacy_imports WHERE payload_hash = ?1 AND status = 'imported'",
            [hash],
            |r| r.get(0),
        )
        .optional()?)
}

pub fn record(
    conn: &Connection,
    hash: &str,
    payload: &str,
    status: &str,
    detail: &str,
    now: i64,
) -> AppResult<()> {
    // Keep one row per (payload, status): re-running startup must not pile up copies.
    let exists: bool = conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM legacy_imports WHERE payload_hash = ?1 AND status = ?2)",
        params![hash, status],
        |r| r.get(0),
    )?;
    if !exists {
        conn.execute(
            "INSERT INTO legacy_imports (payload_hash, payload, status, detail, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![hash, payload, status, detail, now],
        )?;
    }
    Ok(())
}

fn ensure(condition: bool, message: impl FnOnce() -> String) -> AppResult<()> {
    if condition { Ok(()) } else { Err(validation(message())) }
}

fn check_line(line: &LegacyLine, context: &str) -> AppResult<()> {
    ensure(line.quantity > 0 && line.unit_price >= 0, || {
        format!("{context}: ردیف بوفه‌ی «{}» نامعتبر است.", line.name)
    })
}

/// Import into an *uninitialised* database. Caller owns the transaction.
pub fn import(conn: &Connection, payload: &str, now: i64) -> AppResult<ImportSummary> {
    let envelope: Envelope = serde_json::from_str(payload)?;
    ensure(envelope.version == 1, || format!("نسخه‌ی داده‌ی قدیمی پشتیبانی نمی‌شود: {}", envelope.version))?;
    let state = envelope.state;
    let settings = load_settings(conn)?;
    let mut summary = ImportSummary::default();

    // -- stations & the rate plans they imply ------------------------------------
    ensure(!state.stations.is_empty(), || "داده‌ی قدیمی هیچ ایستگاهی ندارد.".into())?;
    let mut plan_ids: HashMap<(StationKind, i64), String> = HashMap::new();
    let mut station_plan: HashMap<String, (String, String, StationKind)> = HashMap::new();
    let mut names: HashSet<String> = HashSet::new();

    for (index, station) in state.stations.iter().enumerate() {
        ensure(!station.id.trim().is_empty(), || "شناسه‌ی ایستگاه خالی است.".into())?;
        ensure(!station_plan.contains_key(&station.id), || format!("ایستگاه تکراری: {}", station.id))?;
        ensure((0..=100_000_000).contains(&station.hourly_rate), || {
            format!("نرخ ایستگاه «{}» نامعتبر است.", station.name)
        })?;

        let kind = StationKind::parse(&station.kind).unwrap_or_else(|| {
            summary.warnings.push(format!(
                "نوع «{}» برای «{}» شناخته نشد و PS5 در نظر گرفته شد.",
                station.kind, station.name
            ));
            StationKind::Ps5
        });

        let plan_key = (kind, station.hourly_rate);
        let plan_id = match plan_ids.get(&plan_key) {
            Some(id) => id.clone(),
            None => {
                let id = format!("legacy-plan-{}-{}", kind.as_str(), station.hourly_rate);
                // No "·" next to Persian digits: it reads as ۰.
                let name = format!("{} – {}", kind.label(), fa::grouped(station.hourly_rate));
                conn.execute(
                    "INSERT INTO rate_plans (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
                    params![id, name, now],
                )?;
                for controllers in LEGACY_CONTROLLER_TIERS {
                    conn.execute(
                        "INSERT INTO rate_plan_tiers (rate_plan_id, controllers, hourly_rate) VALUES (?1, ?2, ?3)",
                        params![id, controllers, station.hourly_rate],
                    )?;
                }
                plan_ids.insert(plan_key, id.clone());
                summary.rate_plans += 1;
                id
            }
        };

        let mut name = station.name.trim().to_owned();
        if name.is_empty() {
            name = format!("ایستگاه {}", fa::digits(index as i64 + 1));
        }
        if !names.insert(name.clone()) {
            let renamed = format!("{name} ({})", fa::digits(index as i64 + 1));
            summary.warnings.push(format!("نام تکراری «{name}» به «{renamed}» تغییر کرد."));
            names.insert(renamed.clone());
            name = renamed;
        }

        conn.execute(
            "INSERT INTO stations (id, name, kind, rate_plan_id, enabled, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
            params![station.id, name, kind.as_str(), plan_id, !station.out_of_service, index as i64 + 1, now],
        )?;
        let plan_name: String =
            conn.query_row("SELECT name FROM rate_plans WHERE id = ?1", [&plan_id], |r| r.get(0))?;
        station_plan.insert(station.id.clone(), (plan_id, plan_name, kind));
        summary.stations += 1;
    }

    seed::insert_products(conn, now)?;
    let known_product = |id: &str| -> AppResult<Option<String>> {
        Ok(conn
            .query_row("SELECT id FROM products WHERE id = ?1", [id], |r| r.get::<_, String>(0))
            .optional()?)
    };

    // -- closed invoices (before open sessions: they reuse session ids) ----------
    let mut invoices = state.invoices;
    invoices.sort_by_key(|i| i.number);
    let mut numbers = HashSet::new();
    for inv in &invoices {
        let ctx = format!("فاکتور {}", fa::digits(inv.number));
        let (plan_id, plan_name, kind) = station_plan
            .get(&inv.station_id)
            .cloned()
            .ok_or_else(|| validation(format!("{ctx}: ایستگاه آن وجود ندارد.")))?;
        ensure(inv.number > 0 && numbers.insert(inv.number), || format!("{ctx}: شماره‌ی تکراری یا نامعتبر."))?;
        ensure(inv.ended_at >= inv.started_at && inv.played_ms >= 0 && inv.paused_ms >= 0, || {
            format!("{ctx}: زمان‌ها نامعتبر است.")
        })?;
        for line in &inv.buffet {
            check_line(line, &ctx)?;
        }
        let lines_total: i64 = inv.buffet.iter().map(|l| l.unit_price * l.quantity).sum();
        ensure(
            lines_total == inv.buffet_total
                && inv.time_cost + inv.buffet_total == inv.subtotal
                && inv.subtotal + inv.rounding == inv.total
                && apply_rounding(inv.subtotal, LEGACY_ROUNDING) == inv.total,
            || format!("{ctx}: جمع مبالغ با ردیف‌ها نمی‌خواند؛ برای جلوگیری از خطای مالی وارد نشد."),
        )?;

        conn.execute(
            "INSERT INTO sessions (id, station_id, rate_plan_id, rate_plan_name, controllers, started_at, closed_at, source)
             VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, 'legacy')",
            params![inv.session_id, inv.station_id, plan_id, plan_name, inv.started_at, inv.ended_at],
        )?;
        conn.execute(
            "INSERT INTO invoices (id, number, session_id, station_id, station_name, station_kind, started_at,
                ended_at, played_ms, paused_ms, time_total, orders_total, subtotal, rounding_unit, rounding_mode,
                rounding, total, store_name, receipt_header, receipt_footer, source, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, 'legacy', ?8)",
            params![
                inv.id, inv.number, inv.session_id, inv.station_id, inv.station_name, kind.as_str(),
                inv.started_at, inv.ended_at, inv.played_ms, inv.paused_ms, inv.time_cost, inv.buffet_total,
                inv.subtotal, LEGACY_ROUNDING.unit, LEGACY_ROUNDING.mode.as_str(), inv.rounding, inv.total,
                settings.store_name, settings.receipt_header, settings.receipt_footer,
            ],
        )?;
        let mut position = 0_i64;
        if inv.played_ms > 0 || inv.time_cost > 0 {
            conn.execute(
                "INSERT INTO invoice_lines (invoice_id, position, kind, label, controllers, duration_ms, unit_price, quantity, amount)
                 VALUES (?1, ?2, 'time', 'زمان بازی', 1, ?3, ?4, 1, ?5)",
                params![inv.id, position, inv.played_ms, inv.hourly_rate, inv.time_cost],
            )?;
            position += 1;
        }
        for line in &inv.buffet {
            conn.execute(
                "INSERT INTO invoice_lines (invoice_id, position, kind, label, product_id, unit_price, quantity, amount)
                 VALUES (?1, ?2, 'item', ?3, ?4, ?5, ?6, ?7)",
                params![
                    inv.id, position, line.name, known_product(&line.item_id)?, line.unit_price, line.quantity,
                    line.unit_price * line.quantity
                ],
            )?;
            position += 1;
        }
        summary.invoices += 1;
    }

    // -- open sessions --------------------------------------------------------------
    for (station_key, session) in &state.sessions {
        let ctx = format!("جلسه‌ی ایستگاه {station_key}");
        ensure(&session.station_id == station_key, || format!("{ctx}: شناسه‌ی ایستگاه ناهماهنگ است."))?;
        let (plan_id, plan_name, _) = station_plan
            .get(&session.station_id)
            .cloned()
            .ok_or_else(|| validation(format!("{ctx}: ایستگاه آن وجود ندارد.")))?;
        ensure(session.paused_ms >= 0 && (0..=100_000_000).contains(&session.hourly_rate), || {
            format!("{ctx}: داده‌ی زمان یا نرخ نامعتبر است.")
        })?;

        conn.execute(
            "INSERT INTO sessions (id, station_id, rate_plan_id, rate_plan_name, controllers, started_at, source)
             VALUES (?1, ?2, ?3, ?4, 1, ?5, 'legacy')",
            params![session.id, session.station_id, plan_id, plan_name, session.started_at],
        )?;
        for controllers in LEGACY_CONTROLLER_TIERS {
            conn.execute(
                "INSERT INTO session_rates (session_id, controllers, hourly_rate) VALUES (?1, ?2, ?3)",
                params![session.id, controllers, session.hourly_rate],
            )?;
        }
        // Old model: played = (pausedAt ?? now) − startedAt − pausedMs.
        // One segment starting at startedAt + pausedMs bills identically.
        let start = session.started_at + session.paused_ms;
        let end = session.paused_at.map(|p| p.max(start));
        conn.execute(
            "INSERT INTO session_segments (session_id, started_at, ended_at, controllers, hourly_rate)
             VALUES (?1, ?2, ?3, 1, ?4)",
            params![session.id, start, end, session.hourly_rate],
        )?;
        for line in &session.buffet {
            check_line(line, &ctx)?;
            conn.execute(
                "INSERT INTO order_items (session_id, product_id, name, unit_price, quantity, added_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    session.id,
                    known_product(&line.item_id)?,
                    line.name,
                    line.unit_price,
                    line.quantity,
                    session.started_at
                ],
            )?;
            summary.order_lines += 1;
        }
        summary.open_sessions += 1;
    }

    mark_initialized(conn, now)?;
    meta_set(conn, "legacy_import_completed_at", &now.to_string())?;
    Ok(summary)
}
