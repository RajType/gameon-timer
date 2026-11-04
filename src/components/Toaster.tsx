import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { useEffect } from 'react'
import { cn } from '@/lib/cn'
import { useUiStore, type Toast, type ToastTone } from '@/store/uiStore'

const ICON = { success: CircleCheck, error: CircleAlert, warning: TriangleAlert, info: Info } as const
const TONE: Record<ToastTone, string> = {
  success: 'text-status-running',
  error: 'text-status-maintenance',
  warning: 'text-status-paused',
  info: 'text-label-secondary',
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useUiStore((s) => s.dismissToast)
  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), toast.tone === 'error' ? 9000 : 5000)
    return () => clearTimeout(timer)
  }, [toast, dismiss])
  const Icon = ICON[toast.tone]
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className="glass-thick pointer-events-auto flex w-72 items-start gap-3 rounded-2xl border border-separator p-3.5 shadow-2xl shadow-black/60 motion-safe:animate-pop-in"
    >
      <Icon className={cn('mt-0.5 size-[18px] shrink-0', TONE[toast.tone])} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">{toast.title}</p>
        {toast.detail && <p className="mt-0.5 text-xs leading-5 text-label-secondary">{toast.detail}</p>}
      </div>
      <button
        type="button"
        aria-label="بستن"
        onClick={() => dismiss(toast.id)}
        className="grid size-6 shrink-0 place-items-center rounded-full text-label-tertiary hover:bg-white/10 hover:text-label"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

/**
 * Transient messages in the bottom-start corner (bottom-right in RTL), over the
 * sidebar's empty lower area — clear of page actions, the settings save bar
 * and dialog buttons.
 */
export function Toaster() {
  const toasts = useUiStore((s) => s.toasts)
  return (
    <div aria-live="polite" className="pointer-events-none fixed start-4 bottom-12 z-[60] flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
}
