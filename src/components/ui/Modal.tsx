import { X } from 'lucide-react'
import { useEffect, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'

interface ModalProps {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: string
  /** Block dismissal while a request is in flight. */
  busy?: boolean
}

export function Modal({ title, subtitle, onClose, children, footer, width = 'max-w-[480px]', busy }: ModalProps) {
  const titleId = useId()
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, busy])

  // Portalled to <body>: a `.glass` surface (backdrop-filter) or the scaled floor
  // board (transform) would otherwise become the containing block of this
  // `position: fixed` layer and trap the dialog inside it.
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-6 backdrop-blur-[2px] motion-safe:animate-fade-in"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'glass-thick flex max-h-full w-full flex-col rounded-3xl border border-separator shadow-2xl shadow-black/70 motion-safe:animate-pop-in',
          width,
        )}
      >
        <header className="flex items-start gap-3 px-6 pt-5">
          <div className="leading-tight">
            {subtitle && <p className="text-xs text-label-secondary">{subtitle}</p>}
            <h2 id={titleId} className="mt-1 text-lg font-semibold tracking-tight">
              {title}
            </h2>
          </div>
          <button
            type="button"
            aria-label="بستن"
            onClick={onClose}
            disabled={busy}
            className="ms-auto grid size-8 place-items-center rounded-full bg-white/[0.07] text-label-secondary transition-colors hover:bg-white/[0.12] hover:text-label"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-1">{children}</div>
        {footer && <footer className="flex gap-2 p-6 pt-5">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
