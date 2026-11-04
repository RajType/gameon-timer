//! First-run defaults. Prices are placeholders — every one is editable.

use rusqlite::{Connection, params};

use crate::error::AppResult;
use crate::fa;
use crate::repo::mark_initialized;

/// (controllers, hourly rate in Toman)
pub type Tier = (i64, i64);
/// (id, name, tiers)
pub type PlanSeed = (&'static str, &'static str, [Tier; 4]);

pub const DEFAULT_PLANS: [PlanSeed; 4] = [
    ("plan-ps5", "PS5 استاندارد", [(1, 150_000), (2, 150_000), (3, 190_000), (4, 230_000)]),
    ("plan-ps4", "PS4 استاندارد", [(1, 100_000), (2, 100_000), (3, 130_000), (4, 160_000)]),
    ("plan-xbox", "Xbox استاندارد", [(1, 120_000), (2, 120_000), (3, 150_000), (4, 180_000)]),
    ("plan-vip", "اتاق VIP", [(1, 250_000), (2, 250_000), (3, 300_000), (4, 350_000)]),
];

/// Same ids as the legacy (localStorage) menu so imported orders still match.
pub const DEFAULT_PRODUCTS: [(&str, &str, &str, i64); 8] = [
    ("water", "آب معدنی", "drink", 10_000),
    ("soda", "نوشابه", "drink", 25_000),
    ("energy", "نوشیدنی انرژی‌زا", "drink", 60_000),
    ("coffee", "قهوه", "drink", 45_000),
    ("chips", "چیپس", "snack", 30_000),
    ("puff", "پفک", "snack", 25_000),
    ("cake", "کیک", "snack", 20_000),
    ("sandwich", "ساندویچ", "food", 120_000),
];

pub fn insert_products(conn: &Connection, now: i64) -> AppResult<()> {
    for (i, (id, name, category, price)) in DEFAULT_PRODUCTS.iter().enumerate() {
        conn.execute(
            "INSERT OR IGNORE INTO products (id, name, category, price, active, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, ?6)",
            params![id, name, category, price, i as i64, now],
        )?;
    }
    Ok(())
}

pub fn seed_defaults(conn: &Connection, now: i64) -> AppResult<()> {
    for (id, name, tiers) in DEFAULT_PLANS {
        conn.execute(
            "INSERT INTO rate_plans (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
            params![id, name, now],
        )?;
        for (controllers, rate) in tiers {
            conn.execute(
                "INSERT INTO rate_plan_tiers (rate_plan_id, controllers, hourly_rate) VALUES (?1, ?2, ?3)",
                params![id, controllers, rate],
            )?;
        }
    }
    // Same layout as the first release: 6 × PS5, 4 × PS4.
    for i in 1..=10_i64 {
        let (kind, plan) = if i <= 6 { ("ps5", "plan-ps5") } else { ("ps4", "plan-ps4") };
        conn.execute(
            "INSERT INTO stations (id, name, kind, rate_plan_id, enabled, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, ?6)",
            params![format!("station-{i}"), format!("ایستگاه {}", fa::digits(i)), kind, plan, i, now],
        )?;
    }
    insert_products(conn, now)?;
    mark_initialized(conn, now)
}
