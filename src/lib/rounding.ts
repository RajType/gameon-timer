import type { RoundingMode } from '@/types'

export const ROUNDING_MODE_LABEL: Record<RoundingMode, string> = {
  nearest: 'نزدیک‌ترین',
  up: 'رو به بالا',
  down: 'رو به پایین',
}

/** Units offered in settings (must match `admin::ROUNDING_UNITS` in Rust). */
export const ROUNDING_UNITS = [0, 100, 500, 1_000, 5_000, 10_000] as const
