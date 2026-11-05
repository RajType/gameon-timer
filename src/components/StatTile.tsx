import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

interface StatTileProps {
  icon: LucideIcon
  label: string
  value: string
  hint?: string
  /** `brand` for monetary values. */
  tone?: 'default' | 'brand'
}

export function StatTile({ icon: Icon, label, value, hint, tone = 'default' }: StatTileProps) {
  return (
    <div className="glass flex items-center gap-3 rounded-2xl border border-separator px-4 py-3.5 shadow-glass">
      <div
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-xl',
          tone === 'brand' ? 'bg-brand/12 text-brand' : 'bg-white/[0.06] text-label-secondary',
        )}
      >
        <Icon className="size-[18px]" strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-label-secondary">{label}</p>
        <p
          className={cn(
            'mt-0.5 truncate text-lg leading-tight font-semibold tracking-tight tabular-nums',
            tone === 'brand' && 'text-brand',
          )}
        >
          {value}
        </p>
      </div>
      {hint && <p className="ms-auto shrink-0 text-xs text-label-tertiary">{hint}</p>}
    </div>
  )
}
