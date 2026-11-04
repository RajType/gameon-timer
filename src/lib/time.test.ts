import { describe, expect, it } from 'vitest'
import type { Session } from '@/types'
import { formatDuration, getCurrentRate, getPausedSince, getSessionStatus, HOUR_MS, localDayRange, MINUTE_MS } from './time'

const T0 = Date.UTC(2026, 10, 4, 18, 0, 0)

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    stationId: 'station-1',
    ratePlanName: 'PS5',
    controllers: 2,
    startedAt: T0,
    rates: [
      { controllers: 2, hourlyRate: 150_000 },
      { controllers: 4, hourlyRate: 230_000 },
    ],
    segments: [{ startedAt: T0, endedAt: null, controllers: 2, hourlyRate: 150_000 }],
    orders: [],
    ...overrides,
  }
}

describe('session status from segments', () => {
  it('is running while a segment is open', () => {
    expect(getSessionStatus(session())).toBe('running')
    expect(getPausedSince(session())).toBeUndefined()
    expect(getCurrentRate(session())).toBe(150_000)
  })

  it('is paused when every segment is closed; pause starts at the last end', () => {
    const paused = session({
      controllers: 4,
      segments: [
        { startedAt: T0, endedAt: T0 + 10 * MINUTE_MS, controllers: 2, hourlyRate: 150_000 },
        { startedAt: T0 + 20 * MINUTE_MS, endedAt: T0 + 30 * MINUTE_MS, controllers: 2, hourlyRate: 150_000 },
      ],
    })
    expect(getSessionStatus(paused)).toBe('paused')
    expect(getPausedSince(paused)).toBe(T0 + 30 * MINUTE_MS)
    expect(getCurrentRate(paused)).toBe(230_000) // agreed rate for the new count
  })
})

describe('formatting', () => {
  it('formats HH:MM:SS in Persian digits without wrapping at 24h', () => {
    expect(formatDuration(HOUR_MS + 5 * MINUTE_MS + 9_000)).toBe('۰۱:۰۵:۰۹')
    expect(formatDuration(26 * HOUR_MS)).toBe('۲۶:۰۰:۰۰')
  })

  it('local day range covers 24h containing the timestamp', () => {
    const [from, to] = localDayRange(T0)
    expect(from).toBeLessThanOrEqual(T0)
    expect(to).toBeGreaterThan(T0)
    expect(new Date(from).getHours()).toBe(0)
  })
})
