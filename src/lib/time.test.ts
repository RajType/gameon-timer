import { describe, expect, it } from 'vitest'
import type { Session } from '@/types'
import { formatDuration, getPausedMs, getPlayedMs, HOUR_MS, MINUTE_MS } from './time'

const T0 = Date.UTC(2026, 10, 4, 18, 0, 0)

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    stationId: 'ps5-1',
    startedAt: T0,
    pausedAt: null,
    pausedMs: 0,
    hourlyRate: 150_000,
    buffet: [],
    ...overrides,
  }
}

describe('getPlayedMs', () => {
  it('counts wall-clock time while running', () => {
    expect(getPlayedMs(session(), T0 + HOUR_MS)).toBe(HOUR_MS)
  })

  it('excludes completed pauses', () => {
    expect(getPlayedMs(session({ pausedMs: 10 * MINUTE_MS }), T0 + HOUR_MS)).toBe(50 * MINUTE_MS)
  })

  it('freezes during an ongoing pause, even across a restart', () => {
    const paused = session({ pausedAt: T0 + 30 * MINUTE_MS })
    expect(getPlayedMs(paused, T0 + HOUR_MS)).toBe(30 * MINUTE_MS)
    expect(getPlayedMs(paused, T0 + 5 * HOUR_MS)).toBe(30 * MINUTE_MS)
    expect(getPausedMs(paused, T0 + HOUR_MS)).toBe(30 * MINUTE_MS)
  })

  it('never goes negative when the clock moves backwards', () => {
    expect(getPlayedMs(session(), T0 - MINUTE_MS)).toBe(0)
  })
})

describe('formatDuration', () => {
  it('formats HH:MM:SS in Persian digits', () => {
    expect(formatDuration(HOUR_MS + 5 * MINUTE_MS + 9_000)).toBe('۰۱:۰۵:۰۹')
  })

  it('does not wrap after 24 hours', () => {
    expect(formatDuration(26 * HOUR_MS)).toBe('۲۶:۰۰:۰۰')
  })
})
