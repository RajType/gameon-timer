import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export const controlClass =
  'rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-label outline-none transition-colors placeholder:text-label-tertiary focus:border-brand/60 focus:ring-2 focus:ring-brand/20 disabled:opacity-50 aria-[invalid=true]:border-status-maintenance/70'

interface FieldProps {
  label: string
  htmlFor: string
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  className?: string
}

export function Field({ label, htmlFor, hint, error, children, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-label-secondary">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-status-maintenance">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs leading-5 text-label-tertiary">{hint}</p>
      )}
    </div>
  )
}

/** Full width unless the caller sets one (no class-merge library, so avoid conflicts). */
const width = (className?: string) => (className && /(^|\s)w-/.test(className) ? undefined : 'w-full')

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" className={cn(controlClass, width(className), 'h-10', className)} {...props} />
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn(controlClass, width(className), 'min-h-20 resize-none py-2.5 leading-6', className)} {...props} />
  )
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(controlClass, width(className), 'h-10 appearance-auto bg-surface-raised', className)} {...props}>
      {children}
    </select>
  )
}
