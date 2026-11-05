import { stockLabel, stockLevel } from '@/lib/buffet'
import { cn } from '@/lib/cn'
import type { Product } from '@/types'

const TONE = {
  uncounted: 'bg-white/[0.05] text-label-tertiary',
  out: 'bg-status-maintenance/12 text-status-maintenance',
  low: 'bg-status-paused/12 text-status-paused',
  ok: 'bg-white/[0.06] text-label-secondary',
} as const

export function StockBadge({ product }: { product: Pick<Product, 'stockQuantity'> }) {
  return (
    <span className={cn('inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium tabular-nums', TONE[stockLevel(product)])}>
      {stockLabel(product)}
    </span>
  )
}
