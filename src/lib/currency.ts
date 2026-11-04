/**
 * Currency helpers. All money in the app is an integer amount of Toman.
 * Formatters are created once at module load — Intl constructors are costly.
 */

export const CURRENCY_LABEL = 'تومان'

/** Payable totals are rounded to this unit (CLAUDE.md: nearest 1,000). */
export const ROUNDING_UNIT = 1_000

const numberFormat = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 })
const signedNumberFormat = new Intl.NumberFormat('fa-IR', {
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
})

/** Round to the nearest 1,000 Toman (half rounds up). Never returns `-0`. */
export function roundToThousand(amount: number): number {
  const rounded = Math.round(amount / ROUNDING_UNIT) * ROUNDING_UNIT
  return rounded === 0 ? 0 : rounded
}

/** `1250000` → `"۱٬۲۵۰٬۰۰۰"` */
export function formatNumber(amount: number): string {
  return numberFormat.format(amount === 0 ? 0 : amount)
}

/** `1250000` → `"۱٬۲۵۰٬۰۰۰ تومان"` — for line items and unit prices. */
export function formatToman(amount: number): string {
  return `${formatNumber(amount)} ${CURRENCY_LABEL}`
}

/** Rounds to the nearest 1,000 first — use for every payable total. */
export function formatTotal(amount: number): string {
  return formatToman(roundToThousand(amount))
}

/** `-400` → `"−۴۰۰ تومان"`, `600` → `"+۶۰۰ تومان"` — for adjustments. */
export function formatSignedToman(amount: number): string {
  return `${signedNumberFormat.format(amount === 0 ? 0 : amount)} ${CURRENCY_LABEL}`
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

/** Replace ASCII digits with Persian digits, leaving everything else intact. */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d)
}
