import type { BuffetLine } from './buffet'

/**
 * A play session on a single station.
 *
 * Timing is stored as wall-clock timestamps (epoch ms) rather than a running
 * counter, so elapsed time stays correct across app restarts, crashes, sleep
 * and background throttling. See `@/lib/time` for the derivations.
 */
export interface Session {
  id: string
  stationId: string
  startedAt: number
  /** Start of the current pause, or `null` while the clock is running. */
  pausedAt: number | null
  /** Total duration of all *completed* pauses. */
  pausedMs: number
  /** Toman per hour, copied from the station at start. */
  hourlyRate: number
  buffet: BuffetLine[]
}

export type SessionStatus = 'running' | 'paused'
