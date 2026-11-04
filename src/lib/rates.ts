import type { RateTier } from '@/types'

/** Must match `admin::MAX_CONTROLLERS` / `MAX_HOURLY_RATE` in Rust. */
export const MAX_CONTROLLERS = 8
export const MAX_HOURLY_RATE = 100_000_000

/**
 * Client-side mirror of `admin::validate_tiers` for instant feedback; the
 * backend re-validates. `hourlyRate: null` = empty field.
 */
export function validateTiers(tiers: ReadonlyArray<{ controllers: number; hourlyRate: number | null }>): string | null {
  if (tiers.length === 0) return 'دست‌کم یک نرخ تعریف کنید.'
  const counts = new Set<number>()
  for (const tier of tiers) {
    if (tier.hourlyRate === null) return 'نرخ ساعتی همه‌ی ردیف‌ها را وارد کنید.'
    if (tier.hourlyRate > MAX_HOURLY_RATE) return 'نرخ ساعتی نامعتبر است.'
    if (tier.controllers < 1 || tier.controllers > MAX_CONTROLLERS) return 'تعداد دسته نامعتبر است.'
    if (counts.has(tier.controllers)) return 'برای هر تعداد دسته فقط یک نرخ مجاز است.'
    counts.add(tier.controllers)
  }
  return null
}

export function sortTiers(tiers: readonly RateTier[]): RateTier[] {
  return [...tiers].sort((a, b) => a.controllers - b.controllers)
}
