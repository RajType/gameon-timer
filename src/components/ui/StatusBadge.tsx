import { cn } from '@/lib/cn'
import { STATION_STATUS_LABEL } from '@/lib/station'
import type { StationStatus } from '@/types'

const TONE: Record<StationStatus, string> = {
  running: 'bg-status-running/12 text-status-running',
  paused: 'bg-status-paused/12 text-status-paused',
  available: 'bg-white/[0.06] text-label-secondary',
  maintenance: 'bg-status-maintenance/12 text-status-maintenance',
}

export function StatusBadge({ status }: { status: StationStatus }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium',
        TONE[status],
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full bg-current',
          status === 'running' && 'motion-safe:animate-pulse',
        )}
      />
      {STATION_STATUS_LABEL[status]}
    </span>
  )
}
