import { cn } from '@/lib/cn'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  title?: string
  id?: string
}

/** iOS-style toggle; the knob travels toward the inline end (mirrored in RTL). */
export function Switch({ checked, onChange, label, disabled, title, id }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-40',
        checked ? 'bg-status-running' : 'bg-white/15',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-5 rounded-full bg-white shadow-sm shadow-black/40 transition-transform',
          checked && 'translate-x-4 rtl:-translate-x-4',
        )}
      />
    </button>
  )
}
