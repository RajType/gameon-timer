//! Pure billing math. Mirrored by `src/lib/billing.ts` for live display;
//! both are checked against `tests/fixtures/billing-cases.json`.
//!
//! Rules
//!   1. Play time is the sum of segment durations; pauses are the gaps.
//!   2. Segments with the same (controllers, hourly rate) are merged into one
//!      line, then priced: `round_half_up(duration × rate / 1h)` Toman.
//!   3. Item lines are `unit_price × quantity`.
//!   4. Only the grand total is rounded, using the configured rule.

use crate::fa;
use crate::models::{
    Invoice, InvoiceLine, LineKind, RoundingMode, RoundingRule, Segment, Session, Settings, Station,
};

pub const HOUR_MS: i64 = 3_600_000;

/// Prorated price of `duration_ms` at `hourly_rate`, half-up to whole Toman.
pub fn time_cost(duration_ms: i64, hourly_rate: i64) -> i64 {
    if duration_ms <= 0 || hourly_rate <= 0 {
        return 0;
    }
    let numerator = i128::from(duration_ms) * i128::from(hourly_rate) + i128::from(HOUR_MS / 2);
    (numerator / i128::from(HOUR_MS)) as i64
}

pub fn apply_rounding(amount: i64, rule: RoundingRule) -> i64 {
    let amount = amount.max(0);
    let unit = rule.unit;
    if unit <= 1 {
        return amount;
    }
    match rule.mode {
        RoundingMode::Nearest => (amount * 2 + unit) / (2 * unit) * unit,
        RoundingMode::Up => (amount + unit - 1) / unit * unit,
        RoundingMode::Down => amount / unit * unit,
    }
}

pub fn segment_duration(segment: &Segment, at: i64) -> i64 {
    (segment.ended_at.unwrap_or(at) - segment.started_at).max(0)
}

pub fn played_ms(segments: &[Segment], at: i64) -> i64 {
    segments.iter().map(|s| segment_duration(s, at)).sum()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TimeLine {
    pub controllers: i64,
    pub hourly_rate: i64,
    pub duration_ms: i64,
    pub amount: i64,
}

/// Rule 2: merge by (controllers, rate) in order of first appearance.
pub fn time_lines(segments: &[Segment], at: i64) -> Vec<TimeLine> {
    let mut lines: Vec<TimeLine> = Vec::new();
    for segment in segments {
        let duration = segment_duration(segment, at);
        match lines
            .iter_mut()
            .find(|l| l.controllers == segment.controllers && l.hourly_rate == segment.hourly_rate)
        {
            Some(line) => line.duration_ms += duration,
            None => lines.push(TimeLine {
                controllers: segment.controllers,
                hourly_rate: segment.hourly_rate,
                duration_ms: duration,
                amount: 0,
            }),
        }
    }
    lines.retain(|l| l.duration_ms > 0);
    for line in &mut lines {
        line.amount = time_cost(line.duration_ms, line.hourly_rate);
    }
    lines
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Charges {
    pub played_ms: i64,
    pub paused_ms: i64,
    pub time_lines: Vec<TimeLine>,
    pub time_total: i64,
    pub orders_total: i64,
    pub subtotal: i64,
    pub rounding: i64,
    pub total: i64,
}

pub fn charges(
    started_at: i64,
    segments: &[Segment],
    orders: impl IntoIterator<Item = (i64, i64)>,
    rule: RoundingRule,
    at: i64,
) -> Charges {
    let time_lines = time_lines(segments, at);
    let played_ms: i64 = time_lines.iter().map(|l| l.duration_ms).sum();
    let paused_ms = ((at - started_at).max(0) - played_ms).max(0);
    let time_total: i64 = time_lines.iter().map(|l| l.amount).sum();
    let orders_total: i64 = orders.into_iter().map(|(price, qty)| price * qty).sum();
    let subtotal = time_total + orders_total;
    let total = apply_rounding(subtotal, rule);
    Charges {
        played_ms,
        paused_ms,
        time_lines,
        time_total,
        orders_total,
        subtotal,
        rounding: total - subtotal,
        total,
    }
}

pub fn time_line_label(controllers: i64) -> String {
    format!("زمان بازی ({} دسته)", fa::digits(controllers))
}

/// Build the invoice a session would produce if checked out at `at`.
pub fn build_invoice(
    id: String,
    number: i64,
    station: &Station,
    session: &Session,
    settings: &Settings,
    at: i64,
) -> Invoice {
    let c = charges(
        session.started_at,
        &session.segments,
        session.orders.iter().map(|o| (o.unit_price, o.quantity)),
        settings.rounding(),
        at,
    );

    let mut lines: Vec<InvoiceLine> = c
        .time_lines
        .iter()
        .map(|l| InvoiceLine {
            kind: LineKind::Time,
            label: time_line_label(l.controllers),
            product_id: None,
            controllers: Some(l.controllers),
            duration_ms: Some(l.duration_ms),
            unit_price: l.hourly_rate,
            quantity: 1,
            amount: l.amount,
        })
        .collect();
    lines.extend(session.orders.iter().map(|o| InvoiceLine {
        kind: LineKind::Item,
        label: o.name.clone(),
        product_id: o.product_id.clone(),
        controllers: None,
        duration_ms: None,
        unit_price: o.unit_price,
        quantity: o.quantity,
        amount: o.unit_price * o.quantity,
    }));

    Invoice {
        id,
        number,
        session_id: session.id.clone(),
        station_id: station.id.clone(),
        station_name: station.name.clone(),
        station_kind: station.kind.as_str().to_owned(),
        started_at: session.started_at,
        ended_at: at,
        played_ms: c.played_ms,
        paused_ms: c.paused_ms,
        time_total: c.time_total,
        orders_total: c.orders_total,
        subtotal: c.subtotal,
        rounding_unit: settings.rounding_unit,
        rounding_mode: settings.rounding_mode,
        rounding: c.rounding,
        total: c.total,
        store_name: settings.store_name.clone(),
        receipt_header: settings.receipt_header.clone(),
        receipt_footer: settings.receipt_footer.clone(),
        source: "app".into(),
        lines,
    }
}

/// Internal consistency of an invoice (used before insert and by tests).
pub fn verify_invoice(invoice: &Invoice) -> Result<(), String> {
    let time: i64 = invoice.lines.iter().filter(|l| l.kind == LineKind::Time).map(|l| l.amount).sum();
    let items: i64 = invoice.lines.iter().filter(|l| l.kind == LineKind::Item).map(|l| l.amount).sum();
    let bad_item =
        invoice.lines.iter().any(|l| l.kind == LineKind::Item && l.amount != l.unit_price * l.quantity);
    let rule = RoundingRule { unit: invoice.rounding_unit, mode: invoice.rounding_mode };
    if bad_item {
        return Err("item line amount ≠ unit price × quantity".into());
    }
    if time != invoice.time_total || items != invoice.orders_total {
        return Err(format!(
            "lines ({time} + {items}) ≠ totals ({} + {})",
            invoice.time_total, invoice.orders_total
        ));
    }
    if invoice.subtotal != invoice.time_total + invoice.orders_total {
        return Err("subtotal ≠ time + orders".into());
    }
    if invoice.total != invoice.subtotal + invoice.rounding
        || invoice.total != apply_rounding(invoice.subtotal, rule)
    {
        return Err("total does not follow the recorded rounding rule".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Order {
        unit_price: i64,
        quantity: i64,
    }

    #[derive(Deserialize, Debug, PartialEq)]
    #[serde(rename_all = "camelCase")]
    struct ExpectedLine {
        controllers: i64,
        hourly_rate: i64,
        duration_ms: i64,
        amount: i64,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Expected {
        played_ms: i64,
        paused_ms: i64,
        time_lines: Vec<ExpectedLine>,
        time_total: i64,
        orders_total: i64,
        subtotal: i64,
        rounding: i64,
        total: i64,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Case {
        name: String,
        started_at: i64,
        at: i64,
        segments: Vec<Segment>,
        orders: Vec<Order>,
        rounding: RoundingRule,
        expected: Expected,
    }

    #[test]
    fn golden_cases_shared_with_typescript() {
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("../tests/fixtures/billing-cases.json")).unwrap();
        assert!(cases.len() >= 10);
        for case in cases {
            let c = charges(
                case.started_at,
                &case.segments,
                case.orders.iter().map(|o| (o.unit_price, o.quantity)),
                case.rounding,
                case.at,
            );
            let lines: Vec<ExpectedLine> = c
                .time_lines
                .iter()
                .map(|l| ExpectedLine {
                    controllers: l.controllers,
                    hourly_rate: l.hourly_rate,
                    duration_ms: l.duration_ms,
                    amount: l.amount,
                })
                .collect();
            let e = &case.expected;
            assert_eq!(lines, e.time_lines, "{}", case.name);
            assert_eq!(
                (c.played_ms, c.paused_ms, c.time_total, c.orders_total, c.subtotal, c.rounding, c.total),
                (e.played_ms, e.paused_ms, e.time_total, e.orders_total, e.subtotal, e.rounding, e.total),
                "{}",
                case.name
            );
        }
    }

    #[test]
    fn rounding_modes() {
        let r = |unit, mode| RoundingRule { unit, mode };
        assert_eq!(apply_rounding(16_499, r(1000, RoundingMode::Nearest)), 16_000);
        assert_eq!(apply_rounding(16_500, r(1000, RoundingMode::Nearest)), 17_000);
        assert_eq!(apply_rounding(16_001, r(1000, RoundingMode::Up)), 17_000);
        assert_eq!(apply_rounding(16_000, r(1000, RoundingMode::Up)), 16_000);
        assert_eq!(apply_rounding(16_999, r(1000, RoundingMode::Down)), 16_000);
        assert_eq!(apply_rounding(16_999, r(0, RoundingMode::Down)), 16_999);
        assert_eq!(apply_rounding(0, r(1000, RoundingMode::Up)), 0);
    }
}
