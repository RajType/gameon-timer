import { describe, expect, it } from 'vitest'
import type { Session } from '@/types'
import { buildInvoice, calculateTimeCost, getSessionCharges } from './billing'
import { HOUR_MS, MINUTE_MS } from './time'

const T0 = Date.UTC(2026, 10, 4, 18, 0, 0)

const base: Session = {
  id: 's1',
  stationId: 'ps5-1',
  startedAt: T0,
  pausedAt: null,
  pausedMs: 0,
  hourlyRate: 150_000,
  buffet: [],
}

describe('calculateTimeCost', () => {
  it('prorates the hourly rate', () => {
    expect(calculateTimeCost(HOUR_MS, 150_000)).toBe(150_000)
    expect(calculateTimeCost(20 * MINUTE_MS, 150_000)).toBe(50_000)
    expect(calculateTimeCost(7 * MINUTE_MS, 100_000)).toBe(11_667)
  })
})

describe('getSessionCharges', () => {
  it('adds buffet lines and rounds only the total', () => {
    const s: Session = {
      ...base,
      hourlyRate: 100_000,
      buffet: [{ itemId: 'soda', name: 'نوشابه', unitPrice: 25_000, quantity: 2 }],
    }
    const c = getSessionCharges(s, T0 + 7 * MINUTE_MS)
    expect(c.timeCost).toBe(11_667)
    expect(c.buffetTotal).toBe(50_000)
    expect(c.subtotal).toBe(61_667)
    expect(c.total).toBe(62_000)
  })
})

describe('buildInvoice', () => {
  it('freezes billing at the checkout moment and records the rounding delta', () => {
    const s: Session = { ...base, pausedMs: 10 * MINUTE_MS }
    const invoice = buildInvoice({
      id: 'inv-1',
      number: 1,
      station: { id: 'ps5-1', name: 'PS5 · ۱' },
      session: s,
      endedAt: T0 + 70 * MINUTE_MS + 30_000,
    })
    expect(invoice.playedMs).toBe(60 * MINUTE_MS + 30_000)
    expect(invoice.pausedMs).toBe(10 * MINUTE_MS)
    expect(invoice.timeCost).toBe(151_250)
    expect(invoice.total).toBe(151_000)
    expect(invoice.rounding).toBe(-250)
  })
})
