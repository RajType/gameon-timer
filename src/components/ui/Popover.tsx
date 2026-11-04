import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Button } from './Button'

interface PopoverProps {
  /** Accessible name of the trigger. */
  label: string
  title?: string
  trigger: ReactNode
  children: ReactNode | ((close: () => void) => ReactNode)
  width?: string
  /** `start` opens toward the inline end (left in RTL); `end` toward the start. */
  align?: 'start' | 'end'
  buttonClassName?: string
}

/**
 * Small anchored menu. Solid surface on purpose: it lives inside cards that
 * already use backdrop-filter, and nested backdrop filters cannot blur
 * neighbouring content (glass would look see-through).
 */
export function Popover({ label, title, trigger, children, width = 'w-56', align = 'start', buttonClassName }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const close = () => setOpen(false)

  return (
    <div ref={rootRef} className="relative">
      <Button
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={label}
        title={title}
        onClick={() => setOpen((value) => !value)}
        className={buttonClassName}
      >
        {trigger}
      </Button>

      {open && (
        <div
          id={panelId}
          className={cn(
            'absolute top-full z-30 mt-2 rounded-2xl border border-white/10 bg-surface-raised p-1.5 shadow-2xl shadow-black/60 motion-safe:animate-pop-in',
            align === 'start' ? 'start-0' : 'end-0',
            width,
          )}
        >
          {title && <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-medium text-label-tertiary">{title}</p>}
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  )
}
