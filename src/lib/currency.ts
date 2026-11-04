/**
 * Currency helpers. All money in the app is an integer amount of Toman.
 * Formatters are created once at module load — Intl constructors are costly.
 */

export const CURRENCY_LABEL = 'تومان'

const numberFormat = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 })
const signedNumberFormat = new Intl.NumberFormat('fa-IR', {
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
})

/** `1250000` → `"۱٬۲۵۰٬۰۰۰"` */
export function formatNumber(amount: number): string {
  return numberFormat.format(amount === 0 ? 0 : amount)
}

/** `1250000` → `"۱٬۲۵۰٬۰۰۰ تومان"` */
export function formatToman(amount: number): string {
  return `${formatNumber(amount)} ${CURRENCY_LABEL}`
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

/** Persian (۰-۹) and Arabic-Indic (٠-٩) digits → ASCII. */
export function toAsciiDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
}

/**
 * Parse what an operator types into a money/number field: Persian or Latin
 * digits, any thousands separators. Returns `null` unless it is a
 * non-negative whole number.
 */
export function parseAmountInput(raw: string): number | null {
  const cleaned = toAsciiDigits(raw).replace(/[\s,٬،'’_.]/g, '')
  if (cleaned === '' || !/^\d+$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isSafeInteger(value) ? value : null
}
