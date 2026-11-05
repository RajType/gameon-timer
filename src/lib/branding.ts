/*
 * Dynamic branding. The stored brand colour (SQLite `settings.brand_color`)
 * becomes `--brand-color` on :root; every component uses the `brand` Tailwind
 * tokens derived from it. `--brand-contrast` is black or white, whichever
 * reads better on the brand colour (primary buttons).
 */

export const DEFAULT_BRAND_COLOR = '#d4af37'
/** Must match `--color-canvas` in index.css. */
export const CANVAS_COLOR = '#0b0b0d'
/** Minimum contrast for brand-coloured text (prices) on the dark canvas. */
export const MIN_BRAND_CONTRAST = 3
const CACHE_KEY = 'gameon:brand-color'

export interface ColorPreset {
  color: string
  label: string
}

/** Brand presets offered in Settings (first = default). */
export const BRAND_PRESETS: readonly ColorPreset[] = [
  { color: '#d4af37', label: 'طلایی (پیش‌فرض)' },
  { color: '#0a84ff', label: 'آبی' },
  { color: '#bf5af2', label: 'بنفش' },
  { color: '#ff375f', label: 'قرمز' },
  { color: '#64d2ff', label: 'فیروزه‌ای' },
  { color: '#c7c7cc', label: 'نقره‌ای' },
]

/** `#abc` / `#AABBCC` → `#aabbcc`; `null` if not a colour (mirrors `admin::normalize_hex`). */
export function normalizeHex(raw: string): string | null {
  const value = raw.trim().toLowerCase()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(value)
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
  return /^#[0-9a-f]{6}$/.test(value) ? value : null
}

function channel(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of a `#rrggbb` colour. */
export function relativeLuminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** Text colour for content placed on the brand colour. */
export function contrastText(hex: string): '#000000' | '#ffffff' {
  return contrastRatio(hex, '#000000') >= contrastRatio(hex, '#ffffff') ? '#000000' : '#ffffff'
}

export function isLegibleOnCanvas(hex: string): boolean {
  return contrastRatio(hex, CANVAS_COLOR) >= MIN_BRAND_CONTRAST
}

/**
 * Inject the brand into the CSS root variables. Invalid colours are ignored
 * (the current brand stays). `persist` caches it so the next launch paints the
 * right colour before SQLite has answered; the database stays the source of truth.
 */
export function applyBranding(color: string, { persist = false }: { persist?: boolean } = {}): boolean {
  const hex = normalizeHex(color)
  if (!hex || typeof document === 'undefined') return false
  const root = document.documentElement
  root.style.setProperty('--brand-color', hex)
  root.style.setProperty('--brand-contrast', contrastText(hex))
  if (persist) {
    try {
      localStorage.setItem(CACHE_KEY, hex)
    } catch {
      // Storage unavailable: only costs a colour flash on the next launch.
    }
  }
  return true
}

/** Startup: paint the last known brand before the first render. */
export function applyCachedBranding(): void {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) applyBranding(cached)
  } catch {
    // ignore
  }
}
