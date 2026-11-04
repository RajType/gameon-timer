import { PencilRuler } from 'lucide-react'
import { useMemo } from 'react'
import { FloorMap } from '@/components/FloorMap'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatNumber } from '@/lib/currency'
import { countByStatus } from '@/lib/station'
import { useStationStore } from '@/store/stationStore'
import { useUiStore } from '@/store/uiStore'
import type { StationStatus } from '@/types'

const LEGEND: readonly StationStatus[] = ['running', 'paused', 'available', 'maintenance']

/**
 * Live, read-only floor map: every station at its saved position with the
 * dashboard's own card (timer, cost, start / buffet / checkout). Layout is
 * edited only on the Stations page.
 */
export function FloorPage() {
  const stations = useStationStore((s) => s.stations)
  const sessions = useStationStore((s) => s.sessions)
  const setView = useUiStore((s) => s.setView)
  const setLayoutEditing = useUiStore((s) => s.setLayoutEditing)
  const counts = useMemo(() => countByStatus(stations, sessions), [stations, sessions])

  return (
    <div className="mx-auto flex max-w-[1680px] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <ul aria-label="راهنمای وضعیت" className="flex flex-wrap items-center gap-3">
          {LEGEND.map((status) => (
            <li key={status} className="flex items-center gap-1.5">
              <StatusBadge status={status} />
              <span className="text-xs text-label-secondary tabular-nums">{formatNumber(counts[status])}</span>
            </li>
          ))}
        </ul>
        <p className="ms-auto text-xs text-label-tertiary">نمای زنده؛ جای ایستگاه‌ها در این صفحه تغییر نمی‌کند.</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setLayoutEditing(true)
            setView('stations')
          }}
        >
          <PencilRuler />
          ویرایش چیدمان
        </Button>
      </div>

      <FloorMap stations={stations} />
    </div>
  )
}
