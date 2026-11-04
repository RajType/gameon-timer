import { describe, expect, it } from 'vitest'
import type { Session } from '@/types'
import { computeAlerts, createAlertMemory } from './alerts'
import { MINUTE_MS } from './time'

const T0 = Date.UTC(2026, 10, 4, 18, 0, 0)
const settings = { alertEveryMinutes: 60, longPauseMinutes: 15 }

const running = (id = 's1'): Session => ({
  id,
  stationId: `station-${id}`,
  ratePlanName: 'PS5',
  controllers: 2,
  startedAt: T0,
  rates: [{ controllers: 2, hourlyRate: 150_000 }],
  segments: [{ startedAt: T0, endedAt: null, controllers: 2, hourlyRate: 150_000 }],
  orders: [],
})

const pausedAt = (end: number): Session => ({
  ...running(),
  segments: [{ startedAt: T0, endedAt: end, controllers: 2, hourlyRate: 150_000 }],
})

describe('computeAlerts', () => {
  it('fires once per completed interval, never for the first sighting', () => {
    const memory = createAlertMemory()
    // App (re)started 90 min into a session: silent baseline.
    expect(computeAlerts([running()], settings, T0 + 90 * MINUTE_MS, memory)).toEqual([])
    expect(computeAlerts([running()], settings, T0 + 119 * MINUTE_MS, memory)).toEqual([])
    const alerts = computeAlerts([running()], settings, T0 + 120 * MINUTE_MS, memory)
    expect(alerts).toEqual([{ sessionId: 's1', stationId: 'station-s1', kind: 'interval', minutes: 120 }])
    expect(computeAlerts([running()], settings, T0 + 121 * MINUTE_MS, memory)).toEqual([])
  })

  it('fires once per pause after the limit', () => {
    const memory = createAlertMemory()
    const pause = pausedAt(T0 + 10 * MINUTE_MS)
    expect(computeAlerts([pause], settings, T0 + 11 * MINUTE_MS, memory)).toEqual([])
    const alerts = computeAlerts([pause], settings, T0 + 25 * MINUTE_MS, memory)
    expect(alerts.map((a) => a.kind)).toEqual(['long-pause'])
    expect(computeAlerts([pause], settings, T0 + 40 * MINUTE_MS, memory)).toEqual([])
  })

  it('does not alert for a pause that was already long before the app started', () => {
    const memory = createAlertMemory()
    expect(computeAlerts([pausedAt(T0)], settings, T0 + 3 * 60 * MINUTE_MS, memory)).toEqual([])
    expect(computeAlerts([pausedAt(T0)], settings, T0 + 3 * 60 * MINUTE_MS + 1, memory)).toEqual([])
  })

  it('respects "off" and re-baselines silently when the interval changes', () => {
    const memory = createAlertMemory()
    const off = { alertEveryMinutes: 0, longPauseMinutes: 0 }
    expect(computeAlerts([running()], off, T0, memory)).toEqual([])
    expect(computeAlerts([running()], off, T0 + 600 * MINUTE_MS, memory)).toEqual([])
    expect(computeAlerts([running()], { ...settings, alertEveryMinutes: 15 }, T0 + 601 * MINUTE_MS, memory)).toEqual([])
  })

  it('forgets checked-out sessions', () => {
    const memory = createAlertMemory()
    computeAlerts([running('a'), running('b')], settings, T0, memory)
    computeAlerts([running('a')], settings, T0 + 1, memory)
    expect([...memory.observed]).toEqual(['a'])
  })
})
