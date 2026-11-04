/*
 * Session alerts (pure — the hook in `hooks/useSessionAlerts` plays sounds).
 *
 *   interval   — each time a running session completes N minutes of play.
 *   long-pause — once per pause, when a session stays paused N minutes.
 *
 * Nothing fires for thresholds crossed before the app (re)started: the first
 * time a session is observed, its current state is recorded silently.
 */

import type { Session, Settings } from '@/types'
import { computeCharges } from './billing'
import { getPausedSince, MINUTE_MS } from './time'

export interface SessionAlert {
  sessionId: string
  stationId: string
  kind: 'interval' | 'long-pause'
  /** Minutes played (interval) or minutes paused (long-pause). */
  minutes: number
}

export interface AlertMemory {
  intervalMinutes: number
  /** Sessions seen at least once (first sighting never alerts). */
  observed: Set<string>
  /** sessionId → last completed interval index. */
  milestones: Map<string, number>
  /** sessionId → start of the pause that already alerted. */
  pauseAlerted: Map<string, number>
}

export function createAlertMemory(): AlertMemory {
  return { intervalMinutes: -1, observed: new Set(), milestones: new Map(), pauseAlerted: new Map() }
}

const NO_ROUNDING = { unit: 0, mode: 'nearest' } as const

export function computeAlerts(
  sessions: readonly Session[],
  settings: Pick<Settings, 'alertEveryMinutes' | 'longPauseMinutes'>,
  now: number,
  memory: AlertMemory,
): SessionAlert[] {
  const alerts: SessionAlert[] = []
  const interval = settings.alertEveryMinutes
  if (memory.intervalMinutes !== interval) {
    // New interval → re-baseline silently instead of firing a burst.
    memory.intervalMinutes = interval
    memory.milestones.clear()
  }

  const live = new Set<string>()
  for (const session of sessions) {
    live.add(session.id)
    const seenBefore = memory.observed.has(session.id)

    if (interval > 0) {
      const played = computeCharges(session, NO_ROUNDING, now).playedMs
      const milestone = Math.floor(played / (interval * MINUTE_MS))
      const previous = memory.milestones.get(session.id)
      if (seenBefore && previous !== undefined && milestone > previous) {
        alerts.push({ sessionId: session.id, stationId: session.stationId, kind: 'interval', minutes: milestone * interval })
      }
      memory.milestones.set(session.id, milestone)
    }

    const pausedSince = getPausedSince(session)
    if (settings.longPauseMinutes > 0 && pausedSince !== undefined) {
      const pausedMinutes = Math.floor((now - pausedSince) / MINUTE_MS)
      const alreadyAlerted = memory.pauseAlerted.get(session.id) === pausedSince
      if (!alreadyAlerted && pausedMinutes >= settings.longPauseMinutes) {
        if (seenBefore) {
          alerts.push({ sessionId: session.id, stationId: session.stationId, kind: 'long-pause', minutes: pausedMinutes })
        }
        memory.pauseAlerted.set(session.id, pausedSince)
      }
    }

    memory.observed.add(session.id)
  }

  // Forget sessions that were checked out.
  for (const id of [...memory.observed]) {
    if (live.has(id)) continue
    memory.observed.delete(id)
    memory.milestones.delete(id)
    memory.pauseAlerted.delete(id)
  }
  return alerts
}
