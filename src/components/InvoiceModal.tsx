import { X } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { buildInvoice } from '@/lib/billing'
import { cn } from '@/lib/cn'
import { formatNumber, formatSignedToman, formatToman, toPersianDigits } from '@/lib/currency'
import { formatClock, formatDuration } from '@/lib/time'
import { useStationStore } from '@/store/stationStore'
import { useUiStore, type CheckoutTarget } from '@/store/uiStore'
import { Button } from './ui/Button'

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-1.5 text-[13px]', muted && 'text-label-secondary')}>
      <span className="min-w-0 truncate">{label}</span>
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

function InvoiceDialog({ stationId, at }: CheckoutTarget) {
  const station = useStationStore((s) => s.stations.find((st) => st.id === stationId))
  const session = useStationStore((s) => s.sessions[stationId])
  const nextNumber = useStationStore((s) => s.nextInvoiceNumber)
  const checkout = useStationStore((s) => s.checkout)
  const close = useUiStore((s) => s.closeCheckout)

  // Preview with the exact function the store uses, so what the operator sees
  // is exactly what gets recorded.
  const invoice = useMemo(
    () =>
      station && session
        ? buildInvoice({ id: 'preview', number: nextNumber, station, session, endedAt: at })
        : null,
    [station, session, nextNumber, at],
  )

  useEffect(() => {
    if (!invoice) {
      close()
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [invoice, close])

  if (!invoice) return null

  const confirm = () => {
    checkout(stationId, at)
    close()
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-6 backdrop-blur-[2px] motion-safe:animate-fade-in"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-title"
        className="glass-thick w-full max-w-[440px] rounded-3xl border border-separator shadow-2xl shadow-black/70 motion-safe:animate-pop-in"
      >
        <header className="flex items-start gap-3 px-6 pt-5">
          <div className="leading-tight">
            <p className="text-xs text-label-secondary">
              صورت‌حساب شماره {toPersianDigits(invoice.number)}
            </p>
            <h2 id="invoice-title" className="mt-1 text-lg font-semibold tracking-tight">
              {invoice.stationName}
            </h2>
          </div>
          <button
            type="button"
            aria-label="بستن"
            onClick={close}
            className="ms-auto grid size-8 place-items-center rounded-full bg-white/[0.07] text-label-secondary transition-colors hover:bg-white/[0.12] hover:text-label"
          >
            <X className="size-4" />
          </button>
        </header>

        <dl className="mx-6 mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-separator">
          <Meta label="شروع" value={formatClock(invoice.startedAt)} />
          <Meta label="پایان" value={formatClock(invoice.endedAt)} />
          <Meta label="مدت بازی" value={formatDuration(invoice.playedMs)} />
        </dl>

        <section aria-label="اقلام" className="mt-4 px-6">
          <Row
            label={`زمان بازی · ${formatToman(invoice.hourlyRate)} در ساعت`}
            value={formatToman(invoice.timeCost)}
          />
          {invoice.pausedMs > 0 && (
            <Row label={`مکث (بدون هزینه) · ${formatDuration(invoice.pausedMs)}`} value="—" muted />
          )}
          {invoice.buffet.map((line) => (
            <Row
              key={line.itemId}
              label={`${line.name} × ${formatNumber(line.quantity)}`}
              value={formatToman(line.unitPrice * line.quantity)}
            />
          ))}
        </section>

        <section aria-label="جمع" className="mx-6 mt-3 border-t border-separator pt-3">
          <Row label="جمع اقلام" value={formatToman(invoice.subtotal)} muted />
          {invoice.rounding !== 0 && (
            <Row label="گرد کردن" value={formatSignedToman(invoice.rounding)} muted />
          )}
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-sm font-medium">مبلغ قابل پرداخت</span>
            <span className="text-2xl font-bold tracking-tight text-gold tabular-nums">
              {formatToman(invoice.total)}
            </span>
          </div>
        </section>

        <footer className="flex gap-2 p-6 pt-5">
          <Button variant="primary" size="lg" className="flex-1" onClick={confirm} autoFocus>
            پرداخت و بستن جلسه
          </Button>
          <Button size="lg" onClick={close}>
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
