import { cn } from '@/lib/cn'
import { formatNumber } from '@/lib/currency'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  count?: number
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  'aria-label': string
}

/** Apple-style segmented control. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex rounded-[10px] bg-white/[0.06] p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors',
              selected
                ? 'bg-surface-high text-label shadow-sm shadow-black/40'
                : 'text-label-secondary hover:text-label',
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span className="text-[11px] text-label-tertiary tabular-nums">
                {formatNumber(option.count)}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
