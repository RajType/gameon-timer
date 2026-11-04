import type { BuffetLine } from './buffet'

/** An immutable, closed bill. All amounts are in Toman. */
export interface Invoice {
  id: string
  /** Human-facing sequential number. */
  number: number
  sessionId: string
  stationId: string
  stationName: string

  startedAt: number
  endedAt: number
  /** Billable play time (excludes pauses). */
  playedMs: number
  pausedMs: number
  hourlyRate: number

  timeCost: number
  buffet: BuffetLine[]
  buffetTotal: number
  /** timeCost + buffetTotal, before rounding. */
  subtotal: number
  /** total − subtotal (may be negative). */
  rounding: number
  /** Payable amount, rounded to the nearest 1,000 Toman. */
  total: number
}
