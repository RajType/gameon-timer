import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Apple-style grouped settings section. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-2.5', className)}>
      <div className="flex items-end gap-3 px-1">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-0.5 text-xs leading-5 text-label-secondary">{description}</p>}
        </div>
        {actions && <div className="ms-auto flex shrink-0 gap-2">{actions}</div>}
      </div>
      <div className="glass rounded-2xl border border-separator shadow-glass">{children}</div>
    </section>
  )
}

/** A label/control row inside a Section. */
export function SettingRow({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string
  hint?: ReactNode
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center gap-4 border-b border-separator px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <label htmlFor={htmlFor} className="text-[13px] font-medium">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-xs leading-5 text-label-tertiary">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
