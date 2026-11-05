//! Reads and session operations. Every write function expects to be called
//! inside a transaction owned by the caller (`commands.rs` or tests), so a
//! multi-step change such as checkout is all-or-nothing.

use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, OptionalExtension, params};

use crate::billing;
use crate::error::{AppError, AppResult, conflict, not_found, validation};
use crate::models::{
    Catalog, Category, DaySummary, Floor, Invoice, InvoiceLine, LineKind, OrderItem, Product, RatePlan,
    RateTier, RoundingMode, Segment, Session, Settings, Station, StationKind,
};

/// Clock skew tolerated between the UI's "checkout pressed" time and now.
const CLOCK_TOLERANCE_MS: i64 = 5_000;

pub fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or_default()
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

// ---- meta -------------------------------------------------------------------

pub fn meta_get(conn: &Connection, key: &str) -> AppResult<Option<String>> {
    Ok(conn.query_row("SELECT value FROM meta WHERE key = ?1", [key], |r| r.get(0)).optional()?)
}

pub fn meta_set(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?1, ?2)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn is_initialized(conn: &Connection) -> AppResult<bool> {
    Ok(meta_get(conn, "initialized_at")?.is_some())
}

pub fn mark_initialized(conn: &Connection, now: i64) -> AppResult<()> {
    meta_set(conn, "initialized_at", &now.to_string())
}

// ---- reads ------------------------------------------------------------------

fn station_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Station> {
    let kind: String = row.get(2)?;
    Ok(Station {
        id: row.get(0)?,
        name: row.get(1)?,
        kind: StationKind::parse(&kind).unwrap_or(StationKind::Ps5),
        rate_plan_id: row.get(3)?,
        enabled: row.get(4)?,
        sort_order: row.get(5)?,
        pos_x: row.get(6)?,
        pos_y: row.get(7)?,
    })
}

const STATION_COLUMNS: &str = "id, name, kind, rate_plan_id, enabled, sort_order, pos_x, pos_y";

pub fn load_stations(conn: &Connection) -> AppResult<Vec<Station>> {
    let mut stmt =
        conn.prepare(&format!("SELECT {STATION_COLUMNS} FROM stations ORDER BY sort_order, created_at"))?;
    let rows = stmt.query_map([], station_from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn load_station(conn: &Connection, id: &str) -> AppResult<Station> {
    conn.query_row(&format!("SELECT {STATION_COLUMNS} FROM stations WHERE id = ?1"), [id], station_from_row)
        .optional()?
        .ok_or_else(|| not_found("ایستگاه پیدا نشد."))
}

pub fn load_settings(conn: &Connection) -> AppResult<Settings> {
    Ok(conn.query_row(
        "SELECT store_name, receipt_header, receipt_footer, rounding_unit, rounding_mode,
                sound_enabled, sound_preset, sound_volume, alert_every_minutes, long_pause_minutes,
                brand_color, logo_path
         FROM settings WHERE id = 1",
        [],
        |r| {
            let mode: String = r.get(4)?;
            Ok(Settings {
                store_name: r.get(0)?,
                receipt_header: r.get(1)?,
                receipt_footer: r.get(2)?,
                rounding_unit: r.get(3)?,
                rounding_mode: RoundingMode::parse(&mode).unwrap_or(RoundingMode::Nearest),
                sound_enabled: r.get(5)?,
                sound_preset: r.get(6)?,
                sound_volume: r.get(7)?,
                alert_every_minutes: r.get(8)?,
                long_pause_minutes: r.get(9)?,
                brand_color: r.get(10)?,
                logo_path: r.get(11)?,
            })
        },
    )?)
}

pub fn load_plan_tiers(conn: &Connection, plan_id: &str) -> AppResult<Vec<RateTier>> {
    let mut stmt = conn.prepare(
        "SELECT controllers, hourly_rate FROM rate_plan_tiers WHERE rate_plan_id = ?1 ORDER BY controllers",
    )?;
    let rows =
        stmt.query_map([plan_id], |r| Ok(RateTier { controllers: r.get(0)?, hourly_rate: r.get(1)? }))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn load_catalog(conn: &Connection) -> AppResult<Catalog> {
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, (SELECT COUNT(*) FROM stations s WHERE s.rate_plan_id = p.id)
         FROM rate_plans p ORDER BY p.created_at, p.name",
    )?;
    let plans: Vec<(String, String, i64)> =
        stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?.collect::<Result<_, _>>()?;
    let rate_plans = plans
        .into_iter()
        .map(|(id, name, station_count)| {
            let tiers = load_plan_tiers(conn, &id)?;
            Ok(RatePlan { id, name, tiers, station_count })
        })
        .collect::<AppResult<Vec<_>>>()?;

    Ok(Catalog { rate_plans, products: load_products(conn, false)?, categories: load_categories(conn)? })
}

/// Categories in creation order, with how many products each holds.
pub fn load_categories(conn: &Connection) -> AppResult<Vec<Category>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.name, c.color, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id)
         FROM categories c ORDER BY c.id",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(Category { id: r.get(0)?, name: r.get(1)?, color: r.get(2)?, product_count: r.get(3)? })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Buffet items. `available_only`: active and (not counted, or in stock).
pub fn load_products(conn: &Connection, available_only: bool) -> AppResult<Vec<Product>> {
    let filter = if available_only {
        "WHERE active = 1 AND (stock_quantity IS NULL OR stock_quantity > 0)"
    } else {
        ""
    };
    let mut stmt = conn.prepare(&format!(
        "SELECT id, name, category_id, price, active, sort_order, stock_quantity FROM products {filter}
         ORDER BY sort_order, name"
    ))?;
    let products = stmt
        .query_map([], |r| {
            Ok(Product {
                id: r.get(0)?,
                name: r.get(1)?,
                category_id: r.get(2)?,
                price: r.get(3)?,
                active: r.get(4)?,
                sort_order: r.get(5)?,
                stock_quantity: r.get(6)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(products)
}

fn load_session_children(conn: &Connection, session: &mut Session) -> AppResult<()> {
    let mut stmt = conn.prepare(
        "SELECT controllers, hourly_rate FROM session_rates WHERE session_id = ?1 ORDER BY controllers",
    )?;
    session.rates = stmt
        .query_map([&session.id], |r| Ok(RateTier { controllers: r.get(0)?, hourly_rate: r.get(1)? }))?
        .collect::<Result<_, _>>()?;

    let mut stmt = conn.prepare(
        "SELECT started_at, ended_at, controllers, hourly_rate FROM session_segments
         WHERE session_id = ?1 ORDER BY started_at, id",
    )?;
    session.segments = stmt
        .query_map([&session.id], |r| {
            Ok(Segment {
                started_at: r.get(0)?,
                ended_at: r.get(1)?,
                controllers: r.get(2)?,
                hourly_rate: r.get(3)?,
            })
        })?
        .collect::<Result<_, _>>()?;

    let mut stmt = conn.prepare(
        "SELECT id, product_id, name, unit_price, quantity FROM order_items WHERE session_id = ?1 ORDER BY id",
    )?;
    session.orders = stmt
        .query_map([&session.id], |r| {
            Ok(OrderItem {
                id: r.get(0)?,
                product_id: r.get(1)?,
                name: r.get(2)?,
                unit_price: r.get(3)?,
                quantity: r.get(4)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(())
}

fn session_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Session> {
    Ok(Session {
        id: row.get(0)?,
        station_id: row.get(1)?,
        rate_plan_name: row.get(2)?,
        controllers: row.get(3)?,
        started_at: row.get(4)?,
        rates: Vec::new(),
        segments: Vec::new(),
        orders: Vec::new(),
    })
}

pub fn load_open_sessions(conn: &Connection) -> AppResult<Vec<Session>> {
    let mut stmt = conn.prepare(
        "SELECT id, station_id, rate_plan_name, controllers, started_at FROM sessions
         WHERE closed_at IS NULL ORDER BY started_at",
    )?;
    let mut sessions: Vec<Session> = stmt.query_map([], session_from_row)?.collect::<Result<_, _>>()?;
    for session in &mut sessions {
        load_session_children(conn, session)?;
    }
    Ok(sessions)
}

/// An open session, or a NotFound/Conflict error.
pub fn load_open_session(conn: &Connection, id: &str) -> AppResult<Session> {
    let row = conn
        .query_row(
            "SELECT id, station_id, rate_plan_name, controllers, started_at, closed_at FROM sessions WHERE id = ?1",
            [id],
            |r| Ok((session_from_row(r)?, r.get::<_, Option<i64>>(5)?)),
        )
        .optional()?;
    match row {
        None => Err(not_found("جلسه پیدا نشد.")),
        Some((_, Some(_))) => Err(conflict("این جلسه قبلاً بسته شده است.")),
        Some((mut session, None)) => {
            load_session_children(conn, &mut session)?;
            Ok(session)
        }
    }
}

pub fn load_floor(conn: &Connection) -> AppResult<Floor> {
    Ok(Floor { stations: load_stations(conn)?, sessions: load_open_sessions(conn)? })
}

pub fn day_summary(conn: &Connection, from: i64, to: i64) -> AppResult<DaySummary> {
    Ok(conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(total), 0) FROM invoices WHERE ended_at >= ?1 AND ended_at < ?2",
        params![from, to],
        |r| Ok(DaySummary { invoice_count: r.get(0)?, revenue: r.get(1)? }),
    )?)
}

pub fn next_invoice_number(conn: &Connection) -> AppResult<i64> {
    Ok(conn.query_row("SELECT COALESCE(MAX(number), 0) + 1 FROM invoices", [], |r| r.get(0))?)
}

pub fn load_invoice(conn: &Connection, id: &str) -> AppResult<Invoice> {
    let mut invoice = conn
        .query_row(
            "SELECT id, number, session_id, station_id, station_name, station_kind, started_at, ended_at,
                    played_ms, paused_ms, time_total, orders_total, subtotal, rounding_unit, rounding_mode,
                    rounding, total, store_name, receipt_header, receipt_footer, source
             FROM invoices WHERE id = ?1",
            [id],
            |r| {
                let mode: String = r.get(14)?;
                Ok(Invoice {
                    id: r.get(0)?,
                    number: r.get(1)?,
                    session_id: r.get(2)?,
                    station_id: r.get(3)?,
                    station_name: r.get(4)?,
                    station_kind: r.get(5)?,
                    started_at: r.get(6)?,
                    ended_at: r.get(7)?,
                    played_ms: r.get(8)?,
                    paused_ms: r.get(9)?,
                    time_total: r.get(10)?,
                    orders_total: r.get(11)?,
                    subtotal: r.get(12)?,
                    rounding_unit: r.get(13)?,
                    rounding_mode: RoundingMode::parse(&mode).unwrap_or(RoundingMode::Nearest),
                    rounding: r.get(15)?,
                    total: r.get(16)?,
                    store_name: r.get(17)?,
                    receipt_header: r.get(18)?,
                    receipt_footer: r.get(19)?,
                    source: r.get(20)?,
                    lines: Vec::new(),
                })
            },
        )
        .optional()?
        .ok_or_else(|| not_found("فاکتور پیدا نشد."))?;

    let mut stmt = conn.prepare(
        "SELECT kind, label, product_id, controllers, duration_ms, unit_price, quantity, amount
         FROM invoice_lines WHERE invoice_id = ?1 ORDER BY position",
    )?;
    invoice.lines = stmt
        .query_map([id], |r| {
            let kind: String = r.get(0)?;
            Ok(InvoiceLine {
                kind: if kind == "time" { LineKind::Time } else { LineKind::Item },
                label: r.get(1)?,
                product_id: r.get(2)?,
                controllers: r.get(3)?,
                duration_ms: r.get(4)?,
                unit_price: r.get(5)?,
                quantity: r.get(6)?,
                amount: r.get(7)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(invoice)
}

pub fn list_invoice_ids(conn: &Connection) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare("SELECT id FROM invoices ORDER BY number")?;
    Ok(stmt.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?)
}

// ---- session operations -------------------------------------------------------

pub fn start_session(
    conn: &Connection,
    station_id: &str,
    controllers: Option<i64>,
    now: i64,
) -> AppResult<String> {
    let station = load_station(conn, station_id)?;
    if !station.enabled {
        return Err(conflict("این ایستگاه غیرفعال است."));
    }
    let open: bool = conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM sessions WHERE station_id = ?1 AND closed_at IS NULL)",
        [station_id],
        |r| r.get(0),
    )?;
    if open {
        return Err(conflict("این ایستگاه جلسه‌ی باز دارد."));
    }

    let tiers = load_plan_tiers(conn, &station.rate_plan_id)?;
    let first = tiers.first().ok_or_else(|| validation("برای نرخ این ایستگاه هیچ پله‌ای تعریف نشده است."))?;
    let controllers = controllers.unwrap_or(first.controllers);
    let rate = tiers
        .iter()
        .find(|t| t.controllers == controllers)
        .ok_or_else(|| validation("این تعداد دسته برای این ایستگاه قیمت ندارد."))?
        .hourly_rate;
    let plan_name: String =
        conn.query_row("SELECT name FROM rate_plans WHERE id = ?1", [&station.rate_plan_id], |r| r.get(0))?;

    let id = new_id();
    conn.execute(
        "INSERT INTO sessions (id, station_id, rate_plan_id, rate_plan_name, controllers, started_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, station.id, station.rate_plan_id, plan_name, controllers, now],
    )?;
    for tier in &tiers {
        conn.execute(
            "INSERT INTO session_rates (session_id, controllers, hourly_rate) VALUES (?1, ?2, ?3)",
            params![id, tier.controllers, tier.hourly_rate],
        )?;
    }
    open_segment(conn, &id, now, controllers, rate)?;
    Ok(id)
}

fn open_segment(conn: &Connection, session_id: &str, at: i64, controllers: i64, rate: i64) -> AppResult<()> {
    conn.execute(
        "INSERT INTO session_segments (session_id, started_at, controllers, hourly_rate) VALUES (?1, ?2, ?3, ?4)",
        params![session_id, at, controllers, rate],
    )?;
    Ok(())
}

/// Close the open segment at `at` (never before it started).
fn close_segment(conn: &Connection, session_id: &str, at: i64) -> AppResult<()> {
    conn.execute(
        "UPDATE session_segments SET ended_at = MAX(started_at, ?2) WHERE session_id = ?1 AND ended_at IS NULL",
        params![session_id, at],
    )?;
    Ok(())
}

pub fn pause_session(conn: &Connection, session_id: &str, now: i64) -> AppResult<()> {
    let session = load_open_session(conn, session_id)?;
    if session.open_segment().is_none() {
        return Err(conflict("این جلسه از قبل متوقف است."));
    }
    close_segment(conn, session_id, now)
}

pub fn resume_session(conn: &Connection, session_id: &str, now: i64) -> AppResult<()> {
    let session = load_open_session(conn, session_id)?;
    if session.open_segment().is_some() {
        return Err(conflict("این جلسه در حال اجراست."));
    }
    let rate = session
        .rate_for(session.controllers)
        .ok_or_else(|| AppError::Internal("session rate missing".into()))?;
    let resume_at =
        session.segments.iter().filter_map(|s| s.ended_at).max().map_or(now, |last| now.max(last));
    open_segment(conn, session_id, resume_at, session.controllers, rate)
}

/// Change the controller count. A running session is split at `now` so each
/// part is billed at its own agreed rate.
pub fn set_controllers(conn: &Connection, session_id: &str, controllers: i64, now: i64) -> AppResult<()> {
    let session = load_open_session(conn, session_id)?;
    if session.controllers == controllers {
        return Ok(());
    }
    let rate = session
        .rate_for(controllers)
        .ok_or_else(|| validation("این تعداد دسته برای این جلسه قیمت ندارد."))?;
    conn.execute("UPDATE sessions SET controllers = ?2 WHERE id = ?1", params![session_id, controllers])?;
    if let Some(segment) = session.open_segment() {
        let split_at = now.max(segment.started_at);
        close_segment(conn, session_id, split_at)?;
        open_segment(conn, session_id, split_at, controllers, rate)?;
    }
    Ok(())
}

pub const MAX_ORDER_QUANTITY: i64 = 99;

fn out_of_stock(name: &str, available: i64) -> AppError {
    if available <= 0 {
        conflict(format!("موجودی «{name}» تمام شده است."))
    } else {
        conflict(format!("از «{name}» فقط {} عدد موجود است.", crate::fa::digits(available)))
    }
}

/// Record a buffet order: `quantity` units at the product's *current* price on
/// an open session (running or paused). Counted stock is taken in the same
/// transaction and can never go negative. A later price change starts a new
/// line instead of re-pricing what was already ordered.
pub fn add_order_item(
    conn: &Connection,
    session_id: &str,
    product_id: &str,
    quantity: i64,
    now: i64,
) -> AppResult<()> {
    if !(1..=MAX_ORDER_QUANTITY).contains(&quantity) {
        return Err(validation(format!(
            "تعداد باید بین ۱ تا {} باشد.",
            crate::fa::digits(MAX_ORDER_QUANTITY)
        )));
    }
    // Rejects unknown and closed sessions: orders need an active session.
    load_open_session(conn, session_id)?;
    let (name, price, active, stock): (String, i64, bool, Option<i64>) = conn
        .query_row(
            "SELECT name, price, active, stock_quantity FROM products WHERE id = ?1",
            [product_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()?
        .ok_or_else(|| not_found("کالا پیدا نشد."))?;
    if !active {
        return Err(conflict("این کالا غیرفعال است."));
    }

    let mut stock_units = 0;
    if let Some(available) = stock {
        if available < quantity {
            return Err(out_of_stock(&name, available));
        }
        // Conditional decrement: only succeeds while enough stock remains.
        let taken = conn.execute(
            "UPDATE products SET stock_quantity = stock_quantity - ?2, updated_at = ?3
             WHERE id = ?1 AND stock_quantity >= ?2",
            params![product_id, quantity, now],
        )?;
        if taken == 0 {
            return Err(out_of_stock(&name, available));
        }
        stock_units = quantity;
    }

    let updated = conn.execute(
        "UPDATE order_items SET quantity = quantity + ?5, stock_units = stock_units + ?6
         WHERE session_id = ?1 AND product_id = ?2 AND unit_price = ?3 AND name = ?4",
        params![session_id, product_id, price, name, quantity, stock_units],
    )?;
    if updated == 0 {
        conn.execute(
            "INSERT INTO order_items (session_id, product_id, name, unit_price, quantity, added_at, stock_units)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![session_id, product_id, name, price, quantity, now, stock_units],
        )?;
    }
    Ok(())
}

/// Remove one unit from the most recent line of this product. A unit that was
/// taken from counted stock goes back to stock.
pub fn remove_order_item(conn: &Connection, session_id: &str, product_id: &str, now: i64) -> AppResult<()> {
    load_open_session(conn, session_id)?;
    let line: Option<(i64, i64, i64)> = conn
        .query_row(
            "SELECT id, quantity, stock_units FROM order_items WHERE session_id = ?1 AND product_id = ?2
             ORDER BY id DESC LIMIT 1",
            params![session_id, product_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?;
    let Some((id, quantity, stock_units)) = line else {
        return Err(not_found("این کالا در سفارش نیست."));
    };
    if stock_units > 0 {
        // Only while the item is still counted; switching counting off forgets stock.
        conn.execute(
            "UPDATE products SET stock_quantity = stock_quantity + 1, updated_at = ?2
             WHERE id = ?1 AND stock_quantity IS NOT NULL",
            params![product_id, now],
        )?;
    }
    if quantity == 1 {
        conn.execute("DELETE FROM order_items WHERE id = ?1", [id])?;
    } else {
        conn.execute(
            "UPDATE order_items SET quantity = quantity - 1, stock_units = MAX(stock_units - 1, 0) WHERE id = ?1",
            [id],
        )?;
    }
    Ok(())
}

fn validate_checkout_time(session: &Session, at: i64, now: i64) -> AppResult<()> {
    if at > now + CLOCK_TOLERANCE_MS {
        return Err(validation("زمان تسویه در آینده است."));
    }
    let last_event = session
        .segments
        .iter()
        .map(|s| s.ended_at.unwrap_or(s.started_at))
        .chain(std::iter::once(session.started_at))
        .max()
        .unwrap_or(session.started_at);
    if at < last_event {
        return Err(conflict("جلسه پس از باز شدن صورت‌حساب تغییر کرده است؛ دوباره تسویه کنید."));
    }
    Ok(())
}

/// The invoice this session would get if checked out at `at`. Nothing is written.
pub fn preview_checkout(conn: &Connection, session_id: &str, at: i64, now: i64) -> AppResult<Invoice> {
    let session = load_open_session(conn, session_id)?;
    validate_checkout_time(&session, at, now)?;
    let station = load_station(conn, &session.station_id)?;
    let settings = load_settings(conn)?;
    let number = next_invoice_number(conn)?;
    Ok(billing::build_invoice(String::new(), number, &station, &session, &settings, at))
}

/// Close the session and record its invoice — one transaction (caller's).
/// `expected_total` is the total the operator saw; any drift aborts.
pub fn checkout(
    conn: &Connection,
    session_id: &str,
    at: i64,
    expected_total: Option<i64>,
    now: i64,
) -> AppResult<Invoice> {
    let mut invoice = preview_checkout(conn, session_id, at, now)?;
    if let Some(expected) = expected_total
        && expected != invoice.total
    {
        return Err(conflict("مبلغ صورت‌حساب تغییر کرده است؛ لطفاً دوباره بررسی کنید."));
    }
    invoice.id = new_id();
    billing::verify_invoice(&invoice).map_err(AppError::Internal)?;

    close_segment(conn, session_id, at)?;
    insert_invoice(conn, &invoice, now)?;
    conn.execute("UPDATE sessions SET closed_at = ?2 WHERE id = ?1", params![session_id, at])?;
    Ok(invoice)
}

pub fn insert_invoice(conn: &Connection, invoice: &Invoice, created_at: i64) -> AppResult<()> {
    conn.execute(
        "INSERT INTO invoices (id, number, session_id, station_id, station_name, station_kind, started_at,
            ended_at, played_ms, paused_ms, time_total, orders_total, subtotal, rounding_unit, rounding_mode,
            rounding, total, store_name, receipt_header, receipt_footer, source, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)",
        params![
            invoice.id,
            invoice.number,
            invoice.session_id,
            invoice.station_id,
            invoice.station_name,
            invoice.station_kind,
            invoice.started_at,
            invoice.ended_at,
            invoice.played_ms,
            invoice.paused_ms,
            invoice.time_total,
            invoice.orders_total,
            invoice.subtotal,
            invoice.rounding_unit,
            invoice.rounding_mode.as_str(),
            invoice.rounding,
            invoice.total,
            invoice.store_name,
            invoice.receipt_header,
            invoice.receipt_footer,
            invoice.source,
            created_at,
        ],
    )?;
    for (position, line) in invoice.lines.iter().enumerate() {
        conn.execute(
            "INSERT INTO invoice_lines (invoice_id, position, kind, label, product_id, controllers, duration_ms,
                unit_price, quantity, amount)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                invoice.id,
                position as i64,
                if line.kind == LineKind::Time { "time" } else { "item" },
                line.label,
                line.product_id,
                line.controllers,
                line.duration_ms,
                line.unit_price,
                line.quantity,
                line.amount,
            ],
        )?;
    }
    Ok(())
}
