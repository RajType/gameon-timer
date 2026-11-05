import type { ReactNode } from 'react'
import { useNow } from '@/hooks/useNow'
import { getSessionCharges } from '@/lib/billing'
import { cn } from '@/lib/cn'
import { formatToman } from '@/lib/currency'
import { formatClock, formatDuration, getSessionStatus } from '@/lib/time'
import { useRoundingRule } from '@/store/settingsStore'
import type { Session } from '@/types'

interface MeterViewProps {
  duration: string
  startedAt: string
  buffet: string
  total: string
  tone: 'idle' | 'running' | 'paused'
  /** Rendered opposite the timer (e.g. the status badge). */
  aside?: ReactNode
}

/** Pure layout, shared by live and idle cards so every card has equal height. */
export function MeterView({ duration, startedAt, buffet, total, tone, aside }: MeterViewProps) {
  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p
          dir="ltr"
          className={cn(
            'text-[34px] leading-none font-semibold tracking-tight tabular-nums',
            tone === 'idle' && 'text-label-tertiary',
            tone === 'paused' && 'text-status-paused',
          )}
        >
          {duration}
        </p>
        {aside}
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white/[0.04] px-2.5 py-1.5">
          <dt className="text-label-tertiary">شروع</dt>
          <dd className="mt-0.5 font-medium text-label-secondary tabular-nums">{startedAt}</dd>
        </div>
        <div className="rounded-lg bg-white/[0.04] px-2.5 py-1.5">
          <dt className="text-label-tertiary">بوفه</dt>
          <dd className="mt-0.5 truncate font-medium text-label-secondary tabular-nums">{buffet}</dd>
        </div>
      </dl>

      <div className="flex items-baseline justify-between border-t border-separator pt-3">
        <span className="text-xs text-label-secondary">مبلغ جاری</span>
        <span
          className={cn(
            'text-base font-semibold tabular-nums',
            tone === 'idle' ? 'text-label-tertiary' : 'text-brand',
          )}
        >
          {total}
        </span>
      </div>
    </div>
  )
}

/** Live meter for an open session. The only part of a card that ticks. */
export function SessionMeter({ session, aside }: { session: Session; aside?: ReactNode }) {
  const now = useNow()
  const rule = useRoundingRule()
  const { playedMs, ordersTotal, total } = getSessionCharges(session, rule, now)

  return (
    <MeterView
      duration={formatDuration(playedMs)}
      startedAt={formatClock(session.startedAt)}
      buffet={ordersTotal > 0 ? formatToman(ordersTotal) : '—'}
      total={formatToman(total)}
      tone={getSessionStatus(session)}
      aside={aside}
    />
  )
}
