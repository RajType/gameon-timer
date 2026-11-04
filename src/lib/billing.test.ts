import { describe, expect, it } from 'vitest'
import cases from '../../src-tauri/tests/fixtures/billing-cases.json'
import type { RoundingMode, Segment } from '@/types'
import { applyRounding, computeCharges, timeCost } from './billing'

interface GoldenCase {
  name: string
  startedAt: number
  at: number
  segments: Segment[]
  orders: { unitPrice: number; quantity: number }[]
  rounding: { unit: number; mode: RoundingMode }
  expected: {
    playedMs: number
    pausedMs: number
    timeLines: { controllers: number; hourlyRate: number; durationMs: number; amount: number }[]
    timeTotal: number
    ordersTotal: number
    subtotal: number
    rounding: number
    total: number
  }
}

describe('golden cases shared with Rust (src-tauri/src/billing.rs)', () => {
  it.each((cases as GoldenCase[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const charges = computeCharges({ startedAt: c.startedAt, segments: c.segments, orders: c.orders }, c.rounding, c.at)
    expect(charges).toEqual(c.expected)
  })
})

describe('timeCost', () => {
  it('rounds half Toman up and stays exact for very long sessions', () => {
    expect(timeCost(12, 150_000)).toBe(1) // 0.5 → 1
    expect(timeCost(11, 150_000)).toBe(0)
    // 30 days at 100,000,000/h: beyond 2^53 intermediate, still exact.
    expect(timeCost(30 * 24 * 3_600_000, 100_000_000)).toBe(72_000_000_000)
  })
})

describe('applyRounding', () => {
  it('supports nearest / up / down and "no rounding"', () => {
    expect(applyRounding(16_500, { unit: 1000, mode: 'nearest' })).toBe(17_000)
    expect(applyRounding(16_499, { unit: 1000, mode: 'nearest' })).toBe(16_000)
    expect(applyRounding(16_001, { unit: 5000, mode: 'up' })).toBe(20_000)
    expect(applyRounding(19_999, { unit: 5000, mode: 'down' })).toBe(15_000)
    expect(applyRounding(16_499, { unit: 0, mode: 'nearest' })).toBe(16_499)
  })
})
