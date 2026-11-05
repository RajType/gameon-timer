import { LoaderCircle, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatNumber, formatSignedToman, formatToman, toPersianDigits } from '@/lib/currency'
import { ROUNDING_MODE_LABEL } from '@/lib/rounding'
import { formatClock, formatDuration } from '@/lib/time'
import { useStationStore } from '@/store/stationStore'
import { useUiStore, type CheckoutTarget } from '@/store/uiStore'
import type { Invoice } from '@/types'
import { Button } from './ui/Button'

// Separators: never "·" next to Persian digits — it reads as ۰ (zero).
function Row({ label, detail, value, muted }: { label: string; detail?: string; value: string; muted?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-1.5 text-[13px]', muted && 'text-label-secondary')}>
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {detail && <span className="block truncate text-xs text-label-tertiary tabular-nums">{detail}</span>}
      </span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface/80 px-3 py-2.5">
      <dt className="text-[11px] text-label-tertiary">{label}</dt>
      <dd dir="ltr" className="mt-0.5 text-end text-sm font-medium tabular-nums">
        {value}
      </dd>
    </div>
  )
}

function roundingLabel(invoice: Invoice): string {
  if (invoice.roundingUnit <= 1) return 'گرد کردن'
  return `گرد کردن (${ROUNDING_MODE_LABEL[invoice.roundingMode]} ${formatNumber(invoice.roundingUnit)})`
}

function InvoiceDialog({ stationId, at }: CheckoutTarget) {
  const sessionId = useStationStore((s) => s.sessions[stationId]?.id)
  const checkout = useStationStore((s) => s.checkout)
  const close = useUiStore((s) => s.closeCheckout)
  const reopen = useUiStore((s) => s.openCheckout)
  const pushToast = useUiStore((s) => s.pushToast)

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Synchronous guard: a double click can land before the disabled state renders.
  const submittingRef = useRef(false)

  // The backend computes the preview with the same code that records the
  // invoice, so the operator sees exactly what will be stored.
  useEffect(() => {
    if (!sessionId) {
      close()
      return
    }
    let cancelled = false
    api.previewCheckout(sessionId, at).then(
      (preview) => !cancelled && setInvoice(preview),
      (e: unknown) => !cancelled && setError(errorMessage(e)),
    )
    return () => {
      cancelled = true
    }
  }, [sessionId, at, close])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [close, submitting])

  const confirm = useCallback(async () => {
    if (!invoice || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    try {
      const saved = await checkout(stationId, at, invoice.total)
      close()
      pushToast({
        tone: 'success',
        title: `فاکتور شماره ${toPersianDigits(saved.number)} ثبت شد`,
        detail: `${saved.stationName}، ${formatToman(saved.total)}`,
      })
    } catch (e) {
      if (e instanceof ApiError && e.code === 'conflict') {
        // Something changed since the preview: recompute from now.
        pushToast({ tone: 'warning', title: 'صورت‌حساب به‌روز شد', detail: e.message })
        reopen(stationId)
      } else {
        setError(errorMessage(e))
        submittingRef.current = false
        setSubmitting(false)
      }
    }
  }, [invoice, checkout, stationId, at, close, pushToast, reopen])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-6 backdrop-blur-[2px] motion-safe:animate-fade-in"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !submitting) close()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-title"
        aria-busy={!invoice && !error}
        className="glass-thick w-full max-w-[440px] rounded-3xl border border-separator shadow-2xl shadow-black/70 motion-safe:animate-pop-in"
      >
        <header className="flex items-start gap-3 px-6 pt-5">
          <div className="leading-tight">
            <p className="text-xs text-label-secondary">
              {invoice ? `صورت‌حساب شماره ${toPersianDigits(invoice.number)}` : 'صورت‌حساب'}
            </p>
            <h2 id="invoice-title" className="mt-1 text-lg font-semibold tracking-tight">
              {invoice?.stationName ?? '…'}
            </h2>
          </div>
          <button
            type="button"
            aria-label="بستن"
            onClick={close}
            disabled={submitting}
            className="ms-auto grid size-8 place-items-center rounded-full bg-white/[0.07] text-label-secondary transition-colors hover:bg-white/[0.12] hover:text-label"
          >
            <X className="size-4" />
          </button>
        </header>

        {error ? (
          <p role="alert" className="mx-6 mt-5 rounded-xl bg-status-maintenance/10 px-4 py-3 text-[13px] text-status-maintenance">
            {error}
          </p>
        ) : !invoice ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-label-secondary">
            <LoaderCircle className="size-4 animate-spin" />
            در حال محاسبه…
          </div>
        ) : (
          <>
            <dl className="mx-6 mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-separator">
              <Meta label="شروع" value={formatClock(invoice.startedAt)} />
              <Meta label="پایان" value={formatClock(invoice.endedAt)} />
              <Meta label="مدت بازی" value={formatDuration(invoice.playedMs)} />
            </dl>

            <section aria-label="اقلام" className="mt-4 px-6">
              {invoice.lines.map((line, index) =>
                line.kind === 'time' ? (
                  <Row
                    key={`t${index}`}
                    label={line.label}
                    detail={`مدت ${formatDuration(line.durationMs ?? 0)}، نرخ ${formatToman(line.unitPrice)} در ساعت`}
                    value={formatToman(line.amount)}
                  />
                ) : (
                  <Row
                    key={`i${index}`}
                    label={line.label}
                    detail={`${formatNumber(line.quantity)} × ${formatToman(line.unitPrice)}`}
                    value={formatToman(line.amount)}
                  />
                ),
              )}
              {invoice.pausedMs > 0 && (
                <Row label="مکث (بدون هزینه)" detail={`مدت ${formatDuration(invoice.pausedMs)}`} value="—" muted />
              )}
            </section>

            <section aria-label="جمع" className="mx-6 mt-3 border-t border-separator pt-3">
              <Row label="جمع اقلام" value={formatToman(invoice.subtotal)} muted />
              {invoice.rounding !== 0 && (
                <Row label={roundingLabel(invoice)} value={formatSignedToman(invoice.rounding)} muted />
              )}
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-sm font-medium">مبلغ قابل پرداخت</span>
                <span data-testid="invoice-total" className="text-2xl font-bold tracking-tight text-brand tabular-nums">
                  {formatToman(invoice.total)}
                </span>
              </div>
            </section>
          </>
        )}

        <footer className="flex gap-2 p-6 pt-5">
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            onClick={() => void confirm()}
            disabled={!invoice || Boolean(error) || submitting}
            autoFocus
          >
            {submitting && <LoaderCircle className="animate-spin" />}
            پرداخت و بستن جلسه
          </Button>
          <Button size="lg" onClick={close} disabled={submitting}>
            انصراف
          </Button>
        </footer>
      </div>
    </div>
  )
}

/** Checkout dialog. Mounted once at the app root; opened via `useUiStore`. */
export function InvoiceModal() {
  const target = useUiStore((s) => s.checkout)
  if (!target) return null
  return <InvoiceDialog key={`${target.stationId}:${target.at}`} {...target} />
}
