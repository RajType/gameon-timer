import { describe, expect, it } from 'vitest'
import { defaultSlot, displayPosition, FLOOR, isPlaced, snapPosition } from './station'

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
