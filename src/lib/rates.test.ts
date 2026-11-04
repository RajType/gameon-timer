import { describe, expect, it } from 'vitest'
import { sortTiers, validateTiers } from './rates'

describe('validateTiers (mirror of admin::validate_tiers)', () => {
  it('accepts a normal plan', () => {
    expect(validateTiers([{ controllers: 1, hourlyRate: 150_000 }, { controllers: 4, hourlyRate: 0 }])).toBeNull()
  })

  it('rejects empty, blank, duplicate and out-of-range tiers', () => {
    expect(validateTiers([])).not.toBeNull()
    expect(validateTiers([{ controllers: 1, hourlyRate: null }])).toContain('وارد کنید')
    expect(validateTiers([{ controllers: 2, hourlyRate: 1 }, { controllers: 2, hourlyRate: 2 }])).toContain('فقط یک')
    expect(validateTiers([{ controllers: 9, hourlyRate: 1 }])).not.toBeNull()
    expect(validateTiers([{ controllers: 1, hourlyRate: 100_000_001 }])).not.toBeNull()
  })

  it('sorts by controller count', () => {
    expect(sortTiers([{ controllers: 3, hourlyRate: 1 }, { controllers: 1, hourlyRate: 2 }]).map((t) => t.controllers)).toEqual([1, 3])
  })
})
