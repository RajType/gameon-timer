import type { RateTier } from './rates'
import type { OrderItem } from './product'

/**
 * A billable interval. Pausing closes the open segment; resuming or changing
 * the controller count opens a new one. All times are epoch ms.
 */
export interface Segment {
  startedAt: number
  endedAt: number | null
  controllers: number
  /** Toman per hour, fixed for this segment. */
  hourlyRate: number
}

/** An open (running or paused) session, as stored in SQLite. */
export interface Session {
  id: string
  stationId: string
  ratePlanName: string
  /** Current controller count. */
  controllers: number
  startedAt: number
  /** Rates agreed at start; later plan edits do not affect this session. */
  rates: RateTier[]
  segments: Segment[]
  orders: OrderItem[]
}

export type SessionStatus = 'running' | 'paused'
