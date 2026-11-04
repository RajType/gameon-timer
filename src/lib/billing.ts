import type { BuffetLine, Invoice, Session, Station } from '@/types'
import { roundToThousand } from './currency'
import { getPausedMs, getPlayedMs, HOUR_MS } from './time'

/** Time is prorated to the millisecond; only the final total is rounded. */
export function calculateTimeCost(playedMs: number, hourlyRate: number): number {
  return Math.round((Math.max(0, playedMs) / HOUR_MS) * hourlyRate)
}

export function calculateBuffetTotal(lines: readonly BuffetLine[]): number {
  return lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
}

export interface SessionCharges {
  playedMs: number
  timeCost: number
  buffetTotal: number
  subtotal: number
  /** Rounded to the nearest 1,000 Toman. */
  total: number
}

/** Live charges for an open session at `now`. */
export function getSessionCharges(session: Session, now: number): SessionCharges {
  const playedMs = getPlayedMs(session, now)
  const timeCost = calculateTimeCost(playedMs, session.hourlyRate)
  const buffetTotal = calculateBuffetTotal(session.buffet)
  const subtotal = timeCost + buffetTotal
  return { playedMs, timeCost, buffetTotal, subtotal, total: roundToThousand(subtotal) }
}

export interface BuildInvoiceInput {
  id: string
  number: number
  station: Pick<Station, 'id' | 'name'>
  session: Session
  /** Checkout moment. Billing is frozen here, even if confirmed later. */
  endedAt: number
}

/** Pure: turns an open session into a closed invoice. */
export function buildInvoice({ id, number, station, session, endedAt }: BuildInvoiceInput): Invoice {
  const charges = getSessionCharges(session, endedAt)
  return {
    id,
    number,
    sessionId: session.id,
    stationId: station.id,
    stationName: station.name,
    startedAt: session.startedAt,
    endedAt,
    playedMs: charges.playedMs,
    pausedMs: getPausedMs(session, endedAt),
    hourlyRate: session.hourlyRate,
    timeCost: charges.timeCost,
    buffet: session.buffet.map((line) => ({ ...line })),
    buffetTotal: charges.buffetTotal,
    subtotal: charges.subtotal,
    rounding: charges.total - charges.subtotal,
    total: charges.total,
  }
}
