//! Tauri commands. Each write runs in exactly one SQLite transaction and
//! returns fresh state, so the UI never has to guess what was persisted.

use std::path::PathBuf;

use rusqlite::{Connection, Transaction};
use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::admin;
use crate::backup::{self, BackupInfo, RestoreReport};
use crate::bootstrap::{self, Bootstrap};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::models::{
    Catalog, DaySummary, Floor, Invoice, Product, ProductInput, RatePlanInput, Settings, SettingsInput,
    StationInput,
};
use crate::repo::{self, now_ms};
use crate::state::{AppState, StartupInfo};

fn with_conn<T>(state: &AppState, f: impl FnOnce(&mut Connection) -> AppResult<T>) -> AppResult<T> {
    let mut guard = state.db()?;
    let conn = guard.as_mut().ok_or_else(|| AppError::Internal("database unavailable".into()))?;
    f(conn)
}

fn write<T>(state: &AppState, f: impl FnOnce(&Transaction<'_>) -> AppResult<T>) -> AppResult<T> {
    with_conn(state, |conn| {
        let tx = conn.transaction()?;
        let out = f(&tx)?;
        tx.commit()?;
        Ok(out)
    })
}

fn write_floor(state: &AppState, f: impl FnOnce(&Transaction<'_>) -> AppResult<()>) -> AppResult<Floor> {
    write(state, |tx| {
        f(tx)?;
        repo::load_floor(tx)
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub floor: Floor,
    pub catalog: Catalog,
}

fn write_snapshot(
    state: &AppState,
    f: impl FnOnce(&Transaction<'_>) -> AppResult<()>,
) -> AppResult<Snapshot> {
    write(state, |tx| {
        f(tx)?;
        Ok(Snapshot { floor: repo::load_floor(tx)?, catalog: repo::load_catalog(tx)? })
    })
}

// ---- startup -------------------------------------------------------------------

#[tauri::command]
pub async fn bootstrap(state: State<'_, AppState>, legacy_payload: Option<String>) -> AppResult<Bootstrap> {
    with_conn(&state, |conn| bootstrap::bootstrap(conn, legacy_payload.as_deref(), now_ms()))
}

#[tauri::command]
pub async fn skip_legacy_import(state: State<'_, AppState>, legacy_payload: String) -> AppResult<Bootstrap> {
    with_conn(&state, |conn| bootstrap::skip_legacy(conn, &legacy_payload, now_ms()))
}

// ---- floor ---------------------------------------------------------------------

#[tauri::command]
pub async fn get_floor(state: State<'_, AppState>) -> AppResult<Floor> {
    with_conn(&state, |conn| repo::load_floor(conn))
}

#[tauri::command]
pub async fn start_session(
    state: State<'_, AppState>,
    station_id: String,
    controllers: Option<i64>,
) -> AppResult<Floor> {
    write_floor(&state, |tx| repo::start_session(tx, &station_id, controllers, now_ms()).map(|_| ()))
}

#[tauri::command]
pub async fn pause_session(state: State<'_, AppState>, session_id: String) -> AppResult<Floor> {
    write_floor(&state, |tx| repo::pause_session(tx, &session_id, now_ms()))
}

#[tauri::command]
pub async fn resume_session(state: State<'_, AppState>, session_id: String) -> AppResult<Floor> {
    write_floor(&state, |tx| repo::resume_session(tx, &session_id, now_ms()))
}

#[tauri::command]
pub async fn set_session_controllers(
    state: State<'_, AppState>,
    session_id: String,
    controllers: i64,
) -> AppResult<Floor> {
    write_floor(&state, |tx| repo::set_controllers(tx, &session_id, controllers, now_ms()))
}

/// Floor plus the buffet items, so stock shown everywhere is fresh after an order.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderResult {
    pub floor: Floor,
    pub products: Vec<Product>,
}

fn write_order(
    state: &AppState,
    f: impl FnOnce(&Transaction<'_>) -> AppResult<()>,
) -> AppResult<OrderResult> {
    write(state, |tx| {
        f(tx)?;
        Ok(OrderResult { floor: repo::load_floor(tx)?, products: repo::load_products(tx, false)? })
    })
}

/// Record a buffet order on an active session (stock-checked, atomic).
#[tauri::command]
pub async fn add_order_item(
    state: State<'_, AppState>,
    session_id: String,
    product_id: String,
    quantity: Option<i64>,
) -> AppResult<OrderResult> {
    write_order(&state, |tx| {
        repo::add_order_item(tx, &session_id, &product_id, quantity.unwrap_or(1), now_ms())
    })
}

#[tauri::command]
pub async fn remove_order_item(
    state: State<'_, AppState>,
    session_id: String,
    product_id: String,
) -> AppResult<OrderResult> {
    write_order(&state, |tx| repo::remove_order_item(tx, &session_id, &product_id, now_ms()))
}

/// Buffet items; `available_only` = active and in stock (or not counted).
#[tauri::command]
pub async fn list_buffet_items(
    state: State<'_, AppState>,
    available_only: Option<bool>,
) -> AppResult<Vec<Product>> {
    with_conn(&state, |conn| repo::load_products(conn, available_only.unwrap_or(false)))
}

#[tauri::command]
pub async fn create_product(state: State<'_, AppState>, input: ProductInput) -> AppResult<Vec<Product>> {
    write(&state, |tx| {
        admin::create_product(tx, &input, now_ms())?;
        repo::load_products(tx, false)
    })
}

#[tauri::command]
pub async fn update_product(
    state: State<'_, AppState>,
    id: String,
    input: ProductInput,
) -> AppResult<Vec<Product>> {
    write(&state, |tx| {
        admin::update_product(tx, &id, &input, now_ms())?;
        repo::load_products(tx, false)
    })
}

#[tauri::command]
pub async fn preview_checkout(state: State<'_, AppState>, session_id: String, at: i64) -> AppResult<Invoice> {
    with_conn(&state, |conn| repo::preview_checkout(conn, &session_id, at, now_ms()))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutResult {
    pub invoice: Invoice,
    pub floor: Floor,
}

#[tauri::command]
pub async fn checkout(
    state: State<'_, AppState>,
    session_id: String,
    at: i64,
    expected_total: i64,
) -> AppResult<CheckoutResult> {
    write(&state, |tx| {
        let invoice = repo::checkout(tx, &session_id, at, Some(expected_total), now_ms())?;
        Ok(CheckoutResult { invoice, floor: repo::load_floor(tx)? })
    })
}

#[tauri::command]
pub async fn day_summary(state: State<'_, AppState>, from: i64, to: i64) -> AppResult<DaySummary> {
    with_conn(&state, |conn| repo::day_summary(conn, from, to))
}

// ---- admin ---------------------------------------------------------------------

#[tauri::command]
pub async fn get_catalog(state: State<'_, AppState>) -> AppResult<Catalog> {
    with_conn(&state, |conn| repo::load_catalog(conn))
}

#[tauri::command]
pub async fn create_station(state: State<'_, AppState>, input: StationInput) -> AppResult<Snapshot> {
    write_snapshot(&state, |tx| admin::create_station(tx, &input, now_ms()).map(|_| ()))
}

#[tauri::command]
pub async fn update_station(
    state: State<'_, AppState>,
    id: String,
    input: StationInput,
) -> AppResult<Snapshot> {
    write_snapshot(&state, |tx| admin::update_station(tx, &id, &input, now_ms()))
}

#[tauri::command]
pub async fn set_station_enabled(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> AppResult<Snapshot> {
    write_snapshot(&state, |tx| admin::set_station_enabled(tx, &id, enabled, now_ms()))
}

#[tauri::command]
pub async fn update_station_position(
    state: State<'_, AppState>,
    id: String,
    pos_x: i32,
    pos_y: i32,
) -> AppResult<Floor> {
    write_floor(&state, |tx| admin::update_station_position(tx, &id, pos_x, pos_y, now_ms()))
}

#[tauri::command]
pub async fn create_rate_plan(state: State<'_, AppState>, input: RatePlanInput) -> AppResult<Snapshot> {
    write_snapshot(&state, |tx| admin::create_rate_plan(tx, &input, now_ms()).map(|_| ()))
}

#[tauri::command]
pub async fn update_rate_plan(
    state: State<'_, AppState>,
    id: String,
    input: RatePlanInput,
) -> AppResult<Snapshot> {
    write_snapshot(&state, |tx| admin::update_rate_plan(tx, &id, &input, now_ms()))
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> AppResult<Settings> {
    with_conn(&state, |conn| repo::load_settings(conn))
}

#[tauri::command]
pub async fn update_settings(state: State<'_, AppState>, input: SettingsInput) -> AppResult<Settings> {
    write(&state, |tx| {
        admin::update_settings(tx, &input, now_ms())?;
        repo::load_settings(tx)
    })
}

// ---- data, backup & restore ----------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyImportRecord {
    pub status: String,
    pub payload_hash: String,
    pub payload_bytes: i64,
    pub detail: String,
    pub created_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataInfo {
    pub db_path: String,
    pub backups_dir: String,
    pub schema_version: i64,
    pub latest_schema_version: i64,
    pub size_bytes: u64,
    pub invoice_count: i64,
    pub backups: Vec<BackupInfo>,
    pub legacy_imports: Vec<LegacyImportRecord>,
    pub startup: StartupInfo,
}

fn data_info_inner(state: &AppState, conn: &Connection) -> AppResult<DataInfo> {
    let size = |suffix: &str| {
        let mut path = state.db_path.clone().into_os_string();
        path.push(suffix);
        std::fs::metadata(PathBuf::from(path)).map(|m| m.len()).unwrap_or(0)
    };
    let mut stmt = conn.prepare(
        "SELECT status, payload_hash, length(CAST(payload AS BLOB)), detail, created_at FROM legacy_imports ORDER BY id",
    )?;
    let legacy_imports = stmt
        .query_map([], |r| {
            Ok(LegacyImportRecord {
                status: r.get(0)?,
                payload_hash: r.get(1)?,
                payload_bytes: r.get(2)?,
                detail: r.get(3)?,
                created_at: r.get(4)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(DataInfo {
        db_path: state.db_path.to_string_lossy().into_owned(),
        backups_dir: state.backups_dir.to_string_lossy().into_owned(),
        schema_version: db::schema_version(conn)?,
        latest_schema_version: db::latest_version(),
        size_bytes: size("") + size("-wal"),
        invoice_count: conn.query_row("SELECT COUNT(*) FROM invoices", [], |r| r.get(0))?,
        backups: backup::list_backups(&state.backups_dir)?,
        legacy_imports,
        startup: state.startup.clone(),
    })
}

#[tauri::command]
pub async fn data_info(state: State<'_, AppState>) -> AppResult<DataInfo> {
    with_conn(&state, |conn| data_info_inner(&state, conn))
}

#[tauri::command]
pub async fn create_backup(state: State<'_, AppState>) -> AppResult<DataInfo> {
    with_conn(&state, |conn| {
        backup::create_backup(conn, &state.backups_dir, backup::BackupKind::Manual, now_ms())?;
        data_info_inner(&state, conn)
    })
}

/// Save dialog → compacted copy at the chosen path. `None` if cancelled.
#[tauri::command]
pub async fn export_backup(app: AppHandle, state: State<'_, AppState>) -> AppResult<Option<String>> {
    let suggested = format!("gameon-{}-export.{}", backup::stamp(now_ms()), backup::BACKUP_EXTENSION);
    // Ask first, lock second: the dialog must not hold up the database.
    let Some(choice) = app
        .dialog()
        .file()
        .set_title("ذخیره‌ی پشتیبان")
        .set_file_name(&suggested)
        .add_filter("پشتیبان گیم‌آن", &[backup::BACKUP_EXTENSION])
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let path = choice.into_path().map_err(|e| AppError::Internal(e.to_string()))?;
    with_conn(&state, |conn| backup::export_to(conn, &path))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    pub report: RestoreReport,
    pub bootstrap: Bootstrap,
}

fn restore_from(state: &AppState, path: &std::path::Path) -> AppResult<RestoreResult> {
    with_conn(state, |conn| {
        let report = backup::restore(conn, path, &state.backups_dir, now_ms())?;
        let bootstrap = bootstrap::snapshot(conn, bootstrap::LegacyOutcome::none_public())?;
        Ok(RestoreResult { report, bootstrap })
    })
}

#[tauri::command]
pub async fn restore_backup(state: State<'_, AppState>, file_name: String) -> AppResult<RestoreResult> {
    let path = backup::resolve_in_dir(&state.backups_dir, &file_name)?;
    restore_from(&state, &path)
}

/// Open dialog → validate → restore. `None` if cancelled.
#[tauri::command]
pub async fn restore_backup_from_file(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Option<RestoreResult>> {
    let Some(choice) = app
        .dialog()
        .file()
        .set_title("بازگردانی از پشتیبان")
        .add_filter("پشتیبان گیم‌آن", &[backup::BACKUP_EXTENSION])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = choice.into_path().map_err(|e| AppError::Internal(e.to_string()))?;
    restore_from(&state, &path).map(Some)
}
