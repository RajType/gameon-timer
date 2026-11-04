import { describe, expect, it } from 'vitest'
import {
  boardExtent,
  countByStatus,
  defaultSlot,
  displayPosition,
  fitScale,
  FLOOR,
  isPlaced,
  MIN_FLOOR_SCALE,
  readingOrder,
  snapPosition,
} from './station'

describe('floor map positions', () => {
  it('treats the database default 0,0 as "not placed"', () => {
    expect(isPlaced({ posX: 0, posY: 0 })).toBe(false)
    expect(isPlaced({ posX: 0, posY: 40 })).toBe(true)
  })

  it('lays unplaced stations out right-to-left, one row at a time', () => {
    const width = 4 * FLOOR.cardWidth + 3 * FLOOR.gap + 2 * FLOOR.padding // exactly 4 columns
    const first = defaultSlot(0, width)
    const second = defaultSlot(1, width)
    expect(first).toEqual({ x: width - FLOOR.padding - FLOOR.cardWidth, y: FLOOR.padding })
    expect(second.x).toBeLessThan(first.x)
    expect(defaultSlot(4, width)).toEqual({ x: first.x, y: FLOOR.padding + FLOOR.cardHeight + FLOOR.gap })
  })

  it('keeps default slots stable when another station gets placed', () => {
    const stations = [{ posX: 0, posY: 0 }, { posX: 0, posY: 0 }, { posX: 0, posY: 0 }]
    const before = displayPosition(stations[2]!, 2, 1100)
    stations[0] = { posX: 640, posY: 480 }
    expect(displayPosition(stations[2]!, 2, 1100)).toEqual(before)
    expect(displayPosition(stations[0], 0, 1100)).toEqual({ x: 640, y: 480 })
  })

  it('snaps drops to whole grid steps, inside the board, never 0,0', () => {
    expect(snapPosition({ x: 103.6, y: 57.2 })).toEqual({ x: 104, y: 56 })
    expect(snapPosition({ x: -500, y: 3 })).toEqual({ x: FLOOR.padding, y: FLOOR.padding })
    expect(snapPosition({ x: 1e9, y: 0 }).x).toBe(FLOOR.maxCoordinate)
    const p = snapPosition({ x: 12.3, y: 99.9 })
    expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true)
    expect(isPlaced({ posX: p.x, posY: p.y })).toBe(true)
  })

  it('uses at least one column on a narrow board', () => {
    expect(defaultSlot(3, 200)).toEqual({ x: FLOOR.padding, y: FLOOR.padding + 3 * (FLOOR.cardHeight + FLOOR.gap) })
  })
})

describe('live map layout helpers', () => {
  it('reading order: rows top to bottom, right to left within a row', () => {
    const positions = new Map([
      ['a', { x: 40, y: 360 }],
      ['b', { x: 880, y: 360 }],
      ['c', { x: 312, y: 16 }],
      ['d', { x: 600, y: 700 }],
      ['e', { x: 500, y: 400 }], // 40px lower than a/b: still the same row
    ])
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }))
    expect(readingOrder(items, positions).map((i) => i.id)).toEqual(['c', 'b', 'e', 'a', 'd'])
  })

  it('fitScale shrinks only, in 1% steps, never below the legibility floor', () => {
    expect(fitScale(1000, 1200)).toBe(1)
    expect(fitScale(1176, 1000)).toBe(0.85)
    expect(fitScale(5000, 1000)).toBe(MIN_FLOOR_SCALE)
    expect(fitScale(1000, 0)).toBe(1)
  })

  it('board extent grows to contain every card', () => {
    expect(boardExtent([{ x: 900, y: 700 }], 1000)).toEqual({
      width: 900 + FLOOR.cardWidth + FLOOR.padding,
      height: 700 + FLOOR.cardHeight + FLOOR.padding,
    })
    expect(boardExtent([], 1000)).toEqual({ width: 1000, height: 560 })
  })

  it('counts stations per status (shared by dashboard and map legend)', () => {
    const base = { name: '', kind: 'ps5' as const, ratePlanId: 'p', sortOrder: 0, posX: 0, posY: 0 }
    const list = [
      { ...base, id: '1', enabled: true },
      { ...base, id: '2', enabled: true },
      { ...base, id: '3', enabled: false },
    ]
    const session = {
      id: 's',
      stationId: '1',
      ratePlanName: '',
      controllers: 1,
      startedAt: 0,
      rates: [],
      segments: [{ startedAt: 0, endedAt: null, controllers: 1, hourlyRate: 1 }],
      orders: [],
    }
    expect(countByStatus(list, { '1': session })).toEqual({ running: 1, paused: 0, available: 1, maintenance: 1 })
  })
})
