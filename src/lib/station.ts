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

/** Station count per status — shared by the dashboard filter and the floor-map legend. */
export function countByStatus(
  stations: readonly Station[],
  sessions: Readonly<Record<string, Session | undefined>>,
): Record<StationStatus, number> {
  const counts: Record<StationStatus, number> = { available: 0, running: 0, paused: 0, maintenance: 0 }
  for (const station of stations) counts[getStationStatus(station, sessions[station.id])] += 1
  return counts
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

/** Smallest scale the live map shrinks to before it scrolls instead (text stays legible). */
export const MIN_FLOOR_SCALE = 0.7
export const MIN_BOARD_HEIGHT = 560

/** Logical board size: at least the visible width, grown to contain every card. */
export function boardExtent(positions: Iterable<Point>, boardWidth: number): { width: number; height: number } {
  let width = boardWidth
  let height = MIN_BOARD_HEIGHT
  for (const p of positions) {
    width = Math.max(width, p.x + FLOOR.cardWidth + FLOOR.padding)
    height = Math.max(height, p.y + FLOOR.cardHeight + FLOOR.padding)
  }
  return { width, height }
}

/**
 * Shrink-to-fit factor for the live map: 1 when the layout fits, otherwise
 * the largest 1% step that fits, but never below `MIN_FLOOR_SCALE`. Never
 * enlarges, so saved coordinates always mean the same physical place.
 */
export function fitScale(contentWidth: number, availableWidth: number, min = MIN_FLOOR_SCALE): number {
  if (availableWidth <= 0 || contentWidth <= availableWidth) return 1
  return Math.max(min, Math.floor((availableWidth / contentWidth) * 100) / 100)
}

/**
 * DOM / Tab order that follows what the operator sees: rows top to bottom,
 * each row right to left (RTL). Cards whose tops are within half a card
 * height of a row's first card belong to that row.
 */
export function readingOrder<T extends { id: string }>(items: readonly T[], positions: ReadonlyMap<string, Point>): T[] {
  const entries = items.map((item) => ({ item, p: positions.get(item.id) ?? { x: 0, y: 0 } }))
  entries.sort((a, b) => a.p.y - b.p.y || b.p.x - a.p.x)
  const rows: (typeof entries)[] = []
  for (const entry of entries) {
    const row = rows.at(-1)
    const rowTop = row?.[0]?.p.y
    if (row && rowTop !== undefined && entry.p.y - rowTop < FLOOR.cardHeight / 2) row.push(entry)
    else rows.push([entry])
  }
  return rows.flatMap((row) => row.sort((a, b) => b.p.x - a.p.x).map((e) => e.item))
}

/** Cheapest tier of a plan — shown as "from" price on idle stations. */
export function lowestRate(plan: RatePlan | undefined): number | undefined {
  if (!plan || plan.tiers.length === 0) return undefined
  return Math.min(...plan.tiers.map((t) => t.hourlyRate))
}
