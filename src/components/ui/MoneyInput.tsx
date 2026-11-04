import { useState } from 'react'
import { cn } from '@/lib/cn'
import { CURRENCY_LABEL, formatNumber, parseAmountInput } from '@/lib/currency'
import { controlClass } from './Field'

interface MoneyInputProps {
  id?: string
  value: number | null
  onChange: (value: number | null) => void
  'aria-label'?: string
  invalid?: boolean
  className?: string
}

/**
 * Whole-Toman input. Accepts Persian or Latin digits and any separators;
 * shows the grouped Persian number when not being edited.
 */
export function MoneyInput({ id, value, onChange, invalid, className, ...aria }: MoneyInputProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (value === null ? '' : formatNumber(value))

  return (
    <div className={cn('relative', className)}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        dir="ltr"
        autoComplete="off"
        aria-invalid={invalid || undefined}
        aria-label={aria['aria-label']}
        value={shown}
        onFocus={() => setDraft(value === null ? '' : formatNumber(value))}
        onBlur={() => setDraft(null)}
        onChange={(event) => {
          setDraft(event.target.value)
          onChange(parseAmountInput(event.target.value))
        }}
        className={cn(controlClass, 'h-10 w-full ps-14 text-end tabular-nums')}
      />
      <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-xs text-label-tertiary">
        {CURRENCY_LABEL}
      </span>
    </div>
  )
}
