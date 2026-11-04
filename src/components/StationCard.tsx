import { Gamepad2, Pause, Play, Receipt, Wrench } from 'lucide-react'
import { memo } from 'react'
import { cn } from '@/lib/cn'
import { formatToman } from '@/lib/currency'
import { getStationStatus, lowestRate, STATION_KIND_LABEL } from '@/lib/station'
import { getCurrentRate } from '@/lib/time'
import { useSettingsStore } from '@/store/settingsStore'
import { useStationStore } from '@/store/stationStore'
import { useUiStore } from '@/store/uiStore'
import type { Station, StationStatus } from '@/types'
import { BuffetQuickAdd } from './BuffetQuickAdd'
import { ControllerPicker } from './ControllerPicker'
import { MeterView, SessionMeter } from './SessionMeter'
import { Button } from './ui/Button'
import { StatusBadge } from './ui/StatusBadge'

const BORDER: Record<StationStatus, string> = {
  running: 'border-status-running/25',
  paused: 'border-status-paused/30',
  available: 'border-separator',
  maintenance: 'border-status-maintenance/25',
}

interface StationCardProps {
  station: Station
}

export const StationCard = memo(function StationCard({ station }: StationCardProps) {
  const session = useStationStore((s) => s.sessions[station.id])
  const startSession = useStationStore((s) => s.startSession)
  const pauseSession = useStationStore((s) => s.pauseSession)
  const resumeSession = useStationStore((s) => s.resumeSession)
  const busy = useStationStore((s) => Boolean(s.pending[station.id]))
  const plan = useSettingsStore((s) => s.ratePlans.find((p) => p.id === station.ratePlanId))
  const openCheckout = useUiStore((s) => s.openCheckout)

  const status = getStationStatus(station, session)
  // Open sessions show the rate they are actually billed at; idle stations the plan's "from" price.
  const rate = session ? getCurrentRate(session) : lowestRate(plan)
  const fromPrice = !session && plan !== undefined && new Set(plan.tiers.map((t) => t.hourlyRate)).size > 1

  return (
    <article
      aria-label={station.name}
      className={cn(
        'glass relative flex flex-col rounded-[20px] border p-4 shadow-glass transition-colors',
        // Lift the card above its neighbours while its buffet popover is open.
        'has-[[aria-expanded=true]]:z-20',
        BORDER[status],
        status === 'maintenance' && 'opacity-60',
      )}
    >
      <header className="flex items-start gap-3">
        <div
          dir="ltr"
          title={STATION_KIND_LABEL[station.kind]}
          className={cn(
            'flex size-10 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl',
            status === 'running' ? 'bg-status-running/12 text-status-running' : 'bg-white/[0.06] text-label-secondary',
          )}
        >
          <Gamepad2 className="size-4" strokeWidth={1.8} />
          <span className="text-[9px] leading-none font-bold tracking-wide">{STATION_KIND_LABEL[station.kind]}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] leading-tight font-semibold">{station.name}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-label-secondary">
            {rate !== undefined && (
              <span className="truncate tabular-nums">
                {fromPrice && 'از '}
                {formatToman(rate)} / ساعت
              </span>
            )}
          </p>
        </div>
        {session && <ControllerPicker session={session} />}
      </header>

      {session ? (
        <SessionMeter session={session} aside={<StatusBadge status={status} />} />
      ) : (
        <MeterView
          duration="۰۰:۰۰:۰۰"
          startedAt="—"
          buffet="—"
          total="—"
          tone="idle"
          aside={<StatusBadge status={status} />}
        />
      )}

      <footer className="mt-4 flex items-center gap-2">
        {status === 'available' && (
          <Button variant="primary" className="flex-1" disabled={busy} onClick={() => void startSession(station.id)}>
            <Play />
            شروع جلسه
          </Button>
        )}

        {(status === 'running' || status === 'paused') && (
          <>
            {status === 'running' ? (
              <Button disabled={busy} onClick={() => void pauseSession(station.id)}>
                <Pause />
                مکث
              </Button>
            ) : (
              <Button disabled={busy} onClick={() => void resumeSession(station.id)}>
                <Play />
                ادامه
              </Button>
            )}
            <BuffetQuickAdd stationId={station.id} />
            <Button variant="primary" className="flex-1" disabled={busy} onClick={() => openCheckout(station.id)}>
              <Receipt />
              تسویه
            </Button>
          </>
        )}

        {status === 'maintenance' && (
          <p className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-white/[0.04] text-[13px] text-label-secondary">
            <Wrench className="size-4" />
            غیرفعال
          </p>
        )}
      </footer>
    </article>
  )
})
