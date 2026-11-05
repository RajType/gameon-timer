//! Admin writes: stations, rate plans, settings. Validation messages are the
//! exact Persian text shown to the operator.

use rusqlite::{Connection, params};

use crate::error::{AppResult, conflict, not_found, validation};
use crate::logo;
use crate::models::{CategoryInput, ProductInput, RatePlanInput, RateTier, SettingsInput, StationInput};
use crate::repo::{load_station, new_id};

pub const MAX_NAME_CHARS: usize = 40;
pub const MAX_CONTROLLERS: i64 = 8;
pub const MAX_HOURLY_RATE: i64 = 100_000_000;
pub const ROUNDING_UNITS: [i64; 6] = [0, 100, 500, 1_000, 5_000, 10_000];
pub const SOUND_PRESETS: [&str; 3] = ["chime", "bell", "beep"];
pub const MAX_PRODUCT_PRICE: i64 = 100_000_000;
pub const MAX_STOCK: i64 = 1_000_000;

fn clean_name(raw: &str, what: &str) -> AppResult<String> {
    let name = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() {
        return Err(validation(format!("{what} را وارد کنید.")));
    }
    if name.chars().count() > MAX_NAME_CHARS {
        return Err(validation(format!("{what} حداکثر {MAX_NAME_CHARS} نویسه است.")));
    }
    Ok(name)
}

fn has_open_session(conn: &Connection, station_id: &str) -> AppResult<bool> {
    Ok(conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM sessions WHERE station_id = ?1 AND closed_at IS NULL)",
        [station_id],
        |r| r.get(0),
    )?)
}

fn validate_station(conn: &Connection, input: &StationInput, current_id: Option<&str>) -> AppResult<String> {
    let name = clean_name(&input.name, "نام ایستگاه")?;
    let taken: bool = conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM stations WHERE name = ?1 AND id IS NOT ?2)",
        params![name, current_id],
        |r| r.get(0),
    )?;
    if taken {
        return Err(validation("ایستگاهی با این نام وجود دارد."));
    }
    let plan_exists: bool = conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM rate_plans WHERE id = ?1)",
        [&input.rate_plan_id],
        |r| r.get(0),
    )?;
    if !plan_exists {
        return Err(validation("نرخ انتخاب‌شده وجود ندارد."));
    }
    Ok(name)
}

pub fn create_station(conn: &Connection, input: &StationInput, now: i64) -> AppResult<String> {
    let name = validate_station(conn, input, None)?;
    let sort_order: i64 =
        conn.query_row("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM stations", [], |r| r.get(0))?;
    let id = new_id();
    conn.execute(
        "INSERT INTO stations (id, name, kind, rate_plan_id, enabled, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        params![id, name, input.kind.as_str(), input.rate_plan_id, input.enabled, sort_order, now],
    )?;
    Ok(id)
}

/// Rate-plan changes apply to the *next* session; an open session keeps the
/// rates it started with.
pub fn update_station(conn: &Connection, id: &str, input: &StationInput, now: i64) -> AppResult<()> {
    let current = load_station(conn, id)?;
    let name = validate_station(conn, input, Some(id))?;
    if current.enabled && !input.enabled && has_open_session(conn, id)? {
        return Err(conflict("ایستگاه جلسه‌ی باز دارد؛ ابتدا جلسه را تسویه کنید."));
    }
    conn.execute(
        "UPDATE stations SET name = ?2, kind = ?3, rate_plan_id = ?4, enabled = ?5, updated_at = ?6 WHERE id = ?1",
        params![id, name, input.kind.as_str(), input.rate_plan_id, input.enabled, now],
    )?;
    Ok(())
}

pub fn set_station_enabled(conn: &Connection, id: &str, enabled: bool, now: i64) -> AppResult<()> {
    load_station(conn, id)?;
    if !enabled && has_open_session(conn, id)? {
        return Err(conflict("ایستگاه جلسه‌ی باز دارد؛ ابتدا جلسه را تسویه کنید."));
    }
    conn.execute(
        "UPDATE stations SET enabled = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, enabled, now],
    )?;
    Ok(())
}

/// Move a station on the floor plan. Position is layout only: allowed while a
/// session is open and never touches billing.
pub fn update_station_position(
    conn: &Connection,
    id: &str,
    pos_x: i32,
    pos_y: i32,
    now: i64,
) -> AppResult<()> {
    let updated = conn.execute(
        "UPDATE stations SET pos_x = ?2, pos_y = ?3, updated_at = ?4 WHERE id = ?1",
        params![id, pos_x, pos_y, now],
    )?;
    if updated == 0 {
        return Err(not_found("ایستگاه پیدا نشد."));
    }
    Ok(())
}

fn validate_tiers(tiers: &[RateTier]) -> AppResult<Vec<RateTier>> {
    if tiers.is_empty() {
        return Err(validation("دست‌کم یک نرخ تعریف کنید."));
    }
    let mut sorted = tiers.to_vec();
    sorted.sort_by_key(|t| t.controllers);
    for (i, tier) in sorted.iter().enumerate() {
        if !(1..=MAX_CONTROLLERS).contains(&tier.controllers) {
            return Err(validation(format!("تعداد دسته باید بین ۱ تا {MAX_CONTROLLERS} باشد.")));
        }
        if i > 0 && sorted[i - 1].controllers == tier.controllers {
            return Err(validation("برای هر تعداد دسته فقط یک نرخ مجاز است."));
        }
        if !(0..=MAX_HOURLY_RATE).contains(&tier.hourly_rate) {
            return Err(validation("نرخ ساعتی نامعتبر است."));
        }
    }
    Ok(sorted)
}

fn validate_plan(
    conn: &Connection,
    input: &RatePlanInput,
    current_id: Option<&str>,
) -> AppResult<(String, Vec<RateTier>)> {
    let name = clean_name(&input.name, "نام نرخ")?;
    let taken: bool = conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM rate_plans WHERE name = ?1 AND id IS NOT ?2)",
        params![name, current_id],
        |r| r.get(0),
    )?;
    if taken {
        return Err(validation("نرخی با این نام وجود دارد."));
    }
    Ok((name, validate_tiers(&input.tiers)?))
}

fn write_tiers(conn: &Connection, plan_id: &str, tiers: &[RateTier]) -> AppResult<()> {
    conn.execute("DELETE FROM rate_plan_tiers WHERE rate_plan_id = ?1", [plan_id])?;
    for tier in tiers {
        conn.execute(
            "INSERT INTO rate_plan_tiers (rate_plan_id, controllers, hourly_rate) VALUES (?1, ?2, ?3)",
            params![plan_id, tier.controllers, tier.hourly_rate],
        )?;
    }
    Ok(())
}

pub fn create_rate_plan(conn: &Connection, input: &RatePlanInput, now: i64) -> AppResult<String> {
    let (name, tiers) = validate_plan(conn, input, None)?;
    let id = new_id();
    conn.execute(
        "INSERT INTO rate_plans (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
        params![id, name, now],
    )?;
    write_tiers(conn, &id, &tiers)?;
    Ok(id)
}

/// Only future sessions see the new prices (open sessions hold `session_rates`).
pub fn update_rate_plan(conn: &Connection, id: &str, input: &RatePlanInput, now: i64) -> AppResult<()> {
    let (name, tiers) = validate_plan(conn, input, Some(id))?;
    let updated = conn
        .execute("UPDATE rate_plans SET name = ?2, updated_at = ?3 WHERE id = ?1", params![id, name, now])?;
    if updated == 0 {
        return Err(not_found("نرخ پیدا نشد."));
    }
    write_tiers(conn, id, &tiers)
}

// ---- buffet items ----------------------------------------------------------------

fn validate_product(conn: &Connection, input: &ProductInput, current_id: Option<&str>) -> AppResult<String> {
    let name = clean_name(&input.name, "نام کالا")?;
    let taken: bool = conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM products WHERE name = ?1 AND id IS NOT ?2)",
        params![name, current_id],
        |r| r.get(0),
    )?;
    if taken {
        return Err(validation("کالایی با این نام وجود دارد."));
    }
    if let Some(category) = input.category_id {
        ensure_category(conn, category)?;
    }
    if !(0..=MAX_PRODUCT_PRICE).contains(&input.price) {
        return Err(validation("قیمت نامعتبر است."));
    }
    if let Some(stock) = input.stock_quantity
        && !(0..=MAX_STOCK).contains(&stock)
    {
        return Err(validation("موجودی نمی‌تواند منفی باشد."));
    }
    Ok(name)
}

pub fn create_product(conn: &Connection, input: &ProductInput, now: i64) -> AppResult<String> {
    let name = validate_product(conn, input, None)?;
    let sort_order: i64 =
        conn.query_row("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM products", [], |r| r.get(0))?;
    let id = new_id();
    conn.execute(
        "INSERT INTO products (id, name, category_id, price, active, sort_order, stock_quantity, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
        params![id, name, input.category_id, input.price, input.active, sort_order, input.stock_quantity, now],
    )?;
    Ok(id)
}

/// Price changes affect new orders only (lines snapshot their price). The stock
/// value is a count of what is on hand now (stocktake), `None` stops counting.
pub fn update_product(conn: &Connection, id: &str, input: &ProductInput, now: i64) -> AppResult<()> {
    let name = validate_product(conn, input, Some(id))?;
    let updated = conn.execute(
        "UPDATE products SET name = ?2, category_id = ?3, price = ?4, active = ?5, stock_quantity = ?6, updated_at = ?7
         WHERE id = ?1",
        params![id, name, input.category_id, input.price, input.active, input.stock_quantity, now],
    )?;
    if updated == 0 {
        return Err(not_found("کالا پیدا نشد."));
    }
    Ok(())
}

// ---- categories --------------------------------------------------------------

/// `#abc` / `#AABBCC` → `#aabbcc`; anything else is rejected.
pub fn normalize_hex(raw: &str, what: &str) -> AppResult<String> {
    let value = raw.trim().to_ascii_lowercase();
    let digits = value.strip_prefix('#').unwrap_or("");
    let expanded = match digits.len() {
        3 => digits.chars().flat_map(|c| [c, c]).collect::<String>(),
        6 => digits.to_owned(),
        _ => String::new(),
    };
    if expanded.len() != 6 || !expanded.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(validation(format!("{what} باید یک کد رنگ مانند ‎#d4af37‎ باشد.")));
    }
    Ok(format!("#{expanded}"))
}

fn ensure_category(conn: &Connection, id: i64) -> AppResult<()> {
    let exists: bool =
        conn.query_row("SELECT EXISTS (SELECT 1 FROM categories WHERE id = ?1)", [id], |r| r.get(0))?;
    if exists { Ok(()) } else { Err(validation("دسته‌ی انتخاب‌شده وجود ندارد.")) }
}

fn validate_category(
    conn: &Connection,
    input: &CategoryInput,
    current_id: Option<i64>,
) -> AppResult<(String, String)> {
    let name = clean_name(&input.name, "نام دسته")?;
    let taken: bool = conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM categories WHERE name = ?1 AND id IS NOT ?2)",
        params![name, current_id],
        |r| r.get(0),
    )?;
    if taken {
        return Err(validation("دسته‌ای با این نام وجود دارد."));
    }
    Ok((name, normalize_hex(&input.color, "رنگ دسته")?))
}

pub fn create_category(conn: &Connection, input: &CategoryInput) -> AppResult<i64> {
    let (name, color) = validate_category(conn, input, None)?;
    conn.execute("INSERT INTO categories (name, color) VALUES (?1, ?2)", params![name, color])?;
    Ok(conn.last_insert_rowid())
}

pub fn update_category(conn: &Connection, id: i64, input: &CategoryInput) -> AppResult<()> {
    let (name, color) = validate_category(conn, input, Some(id))?;
    let updated =
        conn.execute("UPDATE categories SET name = ?2, color = ?3 WHERE id = ?1", params![id, name, color])?;
    if updated == 0 {
        return Err(not_found("دسته پیدا نشد."));
    }
    Ok(())
}

/// Delete a category, first moving its products to `reassign_to` (or leaving
/// them uncategorised). Runs in the caller's transaction: all or nothing.
pub fn delete_category(conn: &Connection, id: i64, reassign_to: Option<i64>, now: i64) -> AppResult<usize> {
    let exists: bool =
        conn.query_row("SELECT EXISTS (SELECT 1 FROM categories WHERE id = ?1)", [id], |r| r.get(0))?;
    if !exists {
        return Err(not_found("دسته پیدا نشد."));
    }
    if let Some(target) = reassign_to {
        if target == id {
            return Err(validation("دسته‌ی جایگزین باید با دسته‌ی حذف‌شده فرق داشته باشد."));
        }
        ensure_category(conn, target)?;
    }
    let moved = conn.execute(
        "UPDATE products SET category_id = ?2, updated_at = ?3 WHERE category_id = ?1",
        params![id, reassign_to, now],
    )?;
    conn.execute("DELETE FROM categories WHERE id = ?1", [id])?;
    Ok(moved)
}

/// Move several products into one category (`None` = uncategorised) atomically:
/// if any product id is unknown, nothing changes.
pub fn assign_products_category(
    conn: &Connection,
    product_ids: &[String],
    category_id: Option<i64>,
    now: i64,
) -> AppResult<usize> {
    if product_ids.is_empty() {
        return Err(validation("هیچ کالایی انتخاب نشده است."));
    }
    if let Some(category) = category_id {
        ensure_category(conn, category)?;
    }
    let mut ids: Vec<&String> = product_ids.iter().collect();
    ids.sort();
    ids.dedup();
    for id in &ids {
        let updated = conn.execute(
            "UPDATE products SET category_id = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, category_id, now],
        )?;
        if updated == 0 {
            return Err(not_found("یکی از کالاهای انتخاب‌شده پیدا نشد؛ هیچ تغییری ذخیره نشد."));
        }
    }
    Ok(ids.len())
}

fn validate_text(raw: &str, max: usize, what: &str) -> AppResult<String> {
    let text = raw.trim().replace("\r\n", "\n");
    if text.chars().count() > max {
        return Err(validation(format!("{what} حداکثر {max} نویسه است.")));
    }
    Ok(text)
}

pub fn update_settings(conn: &Connection, input: &SettingsInput, now: i64) -> AppResult<()> {
    let store_name = clean_name(&input.store_name, "نام مجموعه")?;
    let header = validate_text(&input.receipt_header, 300, "سربرگ رسید")?;
    let footer = validate_text(&input.receipt_footer, 300, "پانویس رسید")?;
    if !ROUNDING_UNITS.contains(&input.rounding_unit) {
        return Err(validation("واحد گرد کردن نامعتبر است."));
    }
    if !SOUND_PRESETS.contains(&input.sound_preset.as_str()) {
        return Err(validation("صدای هشدار نامعتبر است."));
    }
    if !(0..=100).contains(&input.sound_volume) {
        return Err(validation("بلندی صدا باید بین ۰ تا ۱۰۰ باشد."));
    }
    for minutes in [input.alert_every_minutes, input.long_pause_minutes] {
        if !(0..=1440).contains(&minutes) {
            return Err(validation("زمان هشدار باید بین ۰ تا ۱۴۴۰ دقیقه باشد."));
        }
    }
    let brand_color = normalize_hex(&input.brand_color, "رنگ برند")?;
    let logo_path = logo::validate_logo_path(&input.logo_path)?;
    conn.execute(
        "UPDATE settings SET store_name = ?1, receipt_header = ?2, receipt_footer = ?3, rounding_unit = ?4,
            rounding_mode = ?5, sound_enabled = ?6, sound_preset = ?7, sound_volume = ?8,
            alert_every_minutes = ?9, long_pause_minutes = ?10, updated_at = ?11,
            brand_color = ?12, logo_path = ?13
         WHERE id = 1",
        params![
            store_name,
            header,
            footer,
            input.rounding_unit,
            input.rounding_mode.as_str(),
            input.sound_enabled,
            input.sound_preset,
            input.sound_volume,
            input.alert_every_minutes,
            input.long_pause_minutes,
            now,
            brand_color,
            logo_path,
        ],
    )?;
    Ok(())
}
