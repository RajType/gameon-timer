import type { RatePlan, Session, Station, StationKind, StationStatus } from '@/types'
import { getSessionStatus } from './time'

export const STATION_KINDS: readonly StationKind[] = ['ps5', 'ps4', 'xbox', 'vip']

export const STATION_KIND_LABEL: Record<StationKind, string> = {
  ps5: 'PS5',
  ps4: 'PS4',
  xbox: 'Xbox',
  vip: 'VIP',
}

export const STATION_STATUS_LABEL: Record<StationStatus, string> = {
  available: 'آزاد',
  running: 'در حال بازی',
  paused: 'متوقف',
  maintenance: 'خارج از سرویس',
}

export function getStationStatus(station: Station, session: Session | undefined): StationStatus {
  if (session) return getSessionStatus(session)
  return station.enabled ? 'available' : 'maintenance'
}

// ---- Floor map -----------------------------------------------------------------

/** Floor-map geometry in px. Cards keep their dashboard size (rate line fits untruncated). */
export const FLOOR = {
  cardWidth: 280,
  cardHeight: 300,
  gap: 16,
  /** Placed positions are never closer than this to the edge — so never 0, 0. */
  padding: 16,
  grid: 8,
  maxCoordinate: 20_000,
} as const

export interface Point {
  x: number
  y: number
}

/** `0, 0` is the database default: the station has never been positioned. */
export function isPlaced(station: Pick<Station, 'posX' | 'posY'>): boolean {
  return station.posX !== 0 || station.posY !== 0
}

/**
 * Default slot for an unplaced station, laid out right-to-left like the
 * dashboard grid. It depends only on the station's index, so placing one
 * station never shifts the others.
 */
export function defaultSlot(index: number, boardWidth: number): Point {
  const { cardWidth, cardHeight, gap, padding } = FLOOR
  const columns = Math.max(1, Math.floor((boardWidth - 2 * padding + gap) / (cardWidth + gap)))
  const column = index % columns
  const row = Math.floor(index / columns)
  return {
    x: Math.max(padding, boardWidth - padding - cardWidth - column * (cardWidth + gap)),
    y: padding + row * (cardHeight + gap),
  }
}

export function displayPosition(station: Pick<Station, 'posX' | 'posY'>, index: number, boardWidth: number): Point {
  return isPlaced(station) ? { x: station.posX, y: station.posY } : defaultSlot(index, boardWidth)
}

/**
 * Snap a dropped position to the grid and keep it on the board. Always whole
 * numbers (the backend takes i32) and never `0, 0`, so it cannot be mistaken
 * for "not placed".
 */
export function snapPosition(point: Point): Point {
  const snap = (value: number) =>
    Math.min(FLOOR.maxCoordinate, Math.max(FLOOR.padding, Math.round(value / FLOOR.grid) * FLOOR.grid))
  return { x: snap(point.x), y: snap(point.y) }
}

/** Cheapest tier of a plan — shown as "from" price on idle stations. */
export function lowestRate(plan: RatePlan | undefined): number | undefined {
  if (!plan || plan.tiers.length === 0) return undefined
  return Math.min(...plan.tiers.map((t) => t.hourlyRate))
}
