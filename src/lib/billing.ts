import type { RoundingRule, Segment, Session } from '@/types'

/*
 * Live billing estimate for the dashboard. Mirrors `src-tauri/src/billing.rs`
 * exactly; both are checked against `src-tauri/tests/fixtures/billing-cases.json`.
 * The authoritative invoice is always computed by the backend at checkout.
 *
 *   1. Play time = Σ segment durations (pauses are the gaps).
 *   2. Segments with the same (controllers, rate) merge into one line, priced
 *      round_half_up(duration × rate / 1h) Toman.
 *   3. Items = unit price × quantity.
 *   4. Only the grand total is rounded, per the configured rule.
 */

export const HOUR_MS = 3_600_000
const HALF_HOUR = BigInt(HOUR_MS / 2)
const HOUR = BigInt(HOUR_MS)

/** Integer-exact (BigInt) so long sessions at high rates never lose precision. */
export function timeCost(durationMs: number, hourlyRate: number): number {
  if (durationMs <= 0 || hourlyRate <= 0) return 0
  return Number((BigInt(Math.trunc(durationMs)) * BigInt(Math.trunc(hourlyRate)) + HALF_HOUR) / HOUR)
}

export function applyRounding(amount: number, rule: RoundingRule): number {
  const value = Math.max(0, amount)
  const { unit } = rule
  if (unit <= 1) return value
  switch (rule.mode) {
    case 'nearest':
      return Math.floor((value * 2 + unit) / (2 * unit)) * unit
    case 'up':
      return Math.floor((value + unit - 1) / unit) * unit
    case 'down':
      return Math.floor(value / unit) * unit
  }
}

export function segmentDuration(segment: Segment, at: number): number {
  return Math.max(0, (segment.endedAt ?? at) - segment.startedAt)
}

export interface TimeLine {
  controllers: number
  hourlyRate: number
  durationMs: number
  amount: number
}

export function timeLines(segments: readonly Segment[], at: number): TimeLine[] {
  const lines: TimeLine[] = []
  for (const segment of segments) {
    const duration = segmentDuration(segment, at)
    const line = lines.find(
      (l) => l.controllers === segment.controllers && l.hourlyRate === segment.hourlyRate,
    )
    if (line) line.durationMs += duration
    else
      lines.push({
        controllers: segment.controllers,
        hourlyRate: segment.hourlyRate,
        durationMs: duration,
        amount: 0,
      })
  }
  return lines
    .filter((l) => l.durationMs > 0)
    .map((l) => ({ ...l, amount: timeCost(l.durationMs, l.hourlyRate) }))
}

export interface Charges {
  playedMs: number
  pausedMs: number
  timeLines: TimeLine[]
  timeTotal: number
  ordersTotal: number
  subtotal: number
  rounding: number
  /** Payable amount after rounding. */
  total: number
}

export interface ChargeInput {
  startedAt: number
  segments: readonly Segment[]
  orders: ReadonlyArray<{ unitPrice: number; quantity: number }>
}

export function computeCharges(input: ChargeInput, rule: RoundingRule, at: number): Charges {
  const lines = timeLines(input.segments, at)
  const playedMs = lines.reduce((sum, l) => sum + l.durationMs, 0)
  const pausedMs = Math.max(0, Math.max(0, at - input.startedAt) - playedMs)
  const timeTotal = lines.reduce((sum, l) => sum + l.amount, 0)
  const ordersTotal = input.orders.reduce((sum, o) => sum + o.unitPrice * o.quantity, 0)
  const subtotal = timeTotal + ordersTotal
  const total = applyRounding(subtotal, rule)
  return { playedMs, pausedMs, timeLines: lines, timeTotal, ordersTotal, subtotal, rounding: total - subtotal, total }
}

export function getSessionCharges(session: Session, rule: RoundingRule, now: number): Charges {
  return computeCharges(session, rule, now)
}
