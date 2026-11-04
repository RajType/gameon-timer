//! Data shapes shared with the UI (serialised camelCase).
//! Money fields are integer Toman; timestamps are epoch milliseconds.

use serde::{Deserialize, Serialize};

use crate::error::{AppResult, validation};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StationKind {
    Ps5,
    Ps4,
    Xbox,
    Vip,
}

impl StationKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Ps5 => "ps5",
            Self::Ps4 => "ps4",
            Self::Xbox => "xbox",
            Self::Vip => "vip",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "ps5" => Some(Self::Ps5),
            "ps4" => Some(Self::Ps4),
            "xbox" => Some(Self::Xbox),
            "vip" => Some(Self::Vip),
            _ => None,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Ps5 => "PS5",
            Self::Ps4 => "PS4",
            Self::Xbox => "Xbox",
            Self::Vip => "VIP",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RoundingMode {
    Nearest,
    Up,
    Down,
}

impl RoundingMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Nearest => "nearest",
            Self::Up => "up",
            Self::Down => "down",
        }
    }

    pub fn parse(value: &str) -> AppResult<Self> {
        match value {
            "nearest" => Ok(Self::Nearest),
            "up" => Ok(Self::Up),
            "down" => Ok(Self::Down),
            other => Err(validation(format!("روش گرد کردن نامعتبر است: {other}"))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoundingRule {
    /// 0 or 1 = no rounding.
    pub unit: i64,
    pub mode: RoundingMode,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Station {
    pub id: String,
    pub name: String,
    pub kind: StationKind,
    pub rate_plan_id: String,
    pub enabled: bool,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RateTier {
    pub controllers: i64,
    pub hourly_rate: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RatePlan {
    pub id: String,
    pub name: String,
    pub tiers: Vec<RateTier>,
    pub station_count: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Product {
    pub id: String,
    pub name: String,
    pub category: String,
    pub price: i64,
    pub active: bool,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub controllers: i64,
    pub hourly_rate: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderItem {
    pub id: i64,
    pub product_id: Option<String>,
    pub name: String,
    pub unit_price: i64,
    pub quantity: i64,
}

/// An open (running or paused) session with everything needed to bill it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub station_id: String,
    pub rate_plan_name: String,
    pub controllers: i64,
    pub started_at: i64,
    /// Rates agreed at start, by controller count.
    pub rates: Vec<RateTier>,
    pub segments: Vec<Segment>,
    pub orders: Vec<OrderItem>,
}

impl Session {
    pub fn open_segment(&self) -> Option<&Segment> {
        self.segments.iter().find(|s| s.ended_at.is_none())
    }

    pub fn rate_for(&self, controllers: i64) -> Option<i64> {
        self.rates.iter().find(|t| t.controllers == controllers).map(|t| t.hourly_rate)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub store_name: String,
    pub receipt_header: String,
    pub receipt_footer: String,
    pub rounding_unit: i64,
    pub rounding_mode: RoundingMode,
    pub sound_enabled: bool,
    pub sound_preset: String,
    pub sound_volume: i64,
    pub alert_every_minutes: i64,
    pub long_pause_minutes: i64,
}

impl Settings {
    pub fn rounding(&self) -> RoundingRule {
        RoundingRule { unit: self.rounding_unit, mode: self.rounding_mode }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LineKind {
    Time,
    Item,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceLine {
    pub kind: LineKind,
    pub label: String,
    pub product_id: Option<String>,
    pub controllers: Option<i64>,
    pub duration_ms: Option<i64>,
    /// Hourly rate for time lines, unit price for items.
    pub unit_price: i64,
    pub quantity: i64,
    pub amount: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Invoice {
    pub id: String,
    pub number: i64,
    pub session_id: String,
    pub station_id: String,
    pub station_name: String,
    pub station_kind: String,
    pub started_at: i64,
    pub ended_at: i64,
    pub played_ms: i64,
    pub paused_ms: i64,
    pub time_total: i64,
    pub orders_total: i64,
    pub subtotal: i64,
    pub rounding_unit: i64,
    pub rounding_mode: RoundingMode,
    pub rounding: i64,
    pub total: i64,
    pub store_name: String,
    pub receipt_header: String,
    pub receipt_footer: String,
    pub source: String,
    pub lines: Vec<InvoiceLine>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Floor {
    pub stations: Vec<Station>,
    /// Open sessions only.
    pub sessions: Vec<Session>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    pub rate_plans: Vec<RatePlan>,
    pub products: Vec<Product>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DaySummary {
    pub invoice_count: i64,
    pub revenue: i64,
}

// ---- Inputs from the admin screens ------------------------------------------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StationInput {
    pub name: String,
    pub kind: StationKind,
    pub rate_plan_id: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RatePlanInput {
    pub name: String,
    pub tiers: Vec<RateTier>,
}

pub type SettingsInput = Settings;
