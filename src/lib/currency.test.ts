import { describe, expect, it } from 'vitest'
import { formatToman, formatTotal, roundToThousand, toPersianDigits } from './currency'

describe('roundToThousand', () => {
  it('rounds to the nearest 1,000', () => {
    expect(roundToThousand(16_499)).toBe(16_000)
    expect(roundToThousand(16_500)).toBe(17_000)
    expect(roundToThousand(16_501)).toBe(17_000)
    expect(roundToThousand(120_000)).toBe(120_000)
  })

  it('never yields negative zero', () => {
    expect(Object.is(roundToThousand(-1), 0)).toBe(true)
    expect(Object.is(roundToThousand(0), 0)).toBe(true)
  })
})

describe('formatting', () => {
  it('uses Persian digits and the Toman label', () => {
    expect(formatToman(1_250_000)).toBe('۱٬۲۵۰٬۰۰۰ تومان')
  })

  it('formatTotal rounds before formatting', () => {
    expect(formatTotal(16_750)).toBe('۱۷٬۰۰۰ تومان')
  })

  it('converts ASCII digits only', () => {
    expect(toPersianDigits('PS5 · 12:05')).toBe('PS۵ · ۱۲:۰۵')
  })
})
