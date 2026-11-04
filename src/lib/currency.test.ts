import { describe, expect, it } from 'vitest'
import { formatSignedToman, formatToman, parseAmountInput, toAsciiDigits, toPersianDigits } from './currency'

describe('formatting', () => {
  it('uses Persian digits and the Toman label', () => {
    expect(formatToman(1_250_000)).toBe('۱٬۲۵۰٬۰۰۰ تومان')
    expect(formatToman(-0)).toBe('۰ تومان')
  })

  it('signs adjustments', () => {
    expect(formatSignedToman(500)).toContain('+۵۰۰')
    expect(formatSignedToman(-500)).toContain('۵۰۰')
    expect(formatSignedToman(0)).toBe('۰ تومان')
  })

  it('converts digits both ways', () => {
    expect(toPersianDigits('PS5 · 12:05')).toBe('PS۵ · ۱۲:۰۵')
    expect(toAsciiDigits('۱۲۳٤٥')).toBe('12345')
  })
})

describe('parseAmountInput', () => {
  it('accepts Persian/Arabic/Latin digits with any separator', () => {
    expect(parseAmountInput('۱۵۰٬۰۰۰')).toBe(150_000)
    expect(parseAmountInput('150,000')).toBe(150_000)
    expect(parseAmountInput(' ١٢٠ ٠٠٠ ')).toBe(120_000)
    expect(parseAmountInput('0')).toBe(0)
  })

  it('rejects anything that is not a whole non-negative number', () => {
    expect(parseAmountInput('')).toBeNull()
    expect(parseAmountInput('-5')).toBeNull()
    expect(parseAmountInput('12a')).toBeNull()
    expect(parseAmountInput('99999999999999999999')).toBeNull()
  })
})
