import { Activity, ReceiptText, Timer, Wallet } from 'lucide-react'
import { useEffect } from 'react'
import { useNow } from '@/hooks/useNow'
import { getSessionCharges } from '@/lib/billing'
import { formatNumber, formatToman } from '@/lib/currency'
import { localDayRange } from '@/lib/time'
import { useRoundingRule } from '@/store/settingsStore'
import { useStationStore } from '@/store/stationStore'
import { StatTile } from './StatTile'

/** KPI strip. Ticks every second on its own so the station grid doesn't. */
export function DashboardStats() {
  const now = useNow()
  const stations = useStationStore((s) => s.stations)
  const sessions = useStationStore((s) => s.sessions)
  const summary = useStationStore((s) => s.daySummary)
  const summaryDay = useStationStore((s) => s.summaryDay)
  const refreshSummary = useStationStore((s) => s.refreshSummary)
  const rule = useRoundingRule()

  // Today's figures come from SQLite; refetch when the local day rolls over.
  const today = localDayRange(now)[0]
  useEffect(() => {
    if (summaryDay !== 0 && summaryDay !== today) void refreshSummary()
  }, [today, summaryDay, refreshSummary])

  const open = Object.values(sessions)
  const inService = stations.filter((station) => station.enabled).length
  // What every open tab would pay right now (each rounded on its own).
  const openTotal = open.reduce((sum, session) => sum + getSessionCharges(session, rule, now).total, 0)

  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <StatTile
        icon={Activity}
        label="ایستگاه‌های فعال"
        value={`${formatNumber(open.length)} از ${formatNumber(inService)}`}
      />
      <StatTile icon={Timer} label="مبلغ جلسات باز" value={formatToman(openTotal)} tone="brand" />
      <StatTile icon={Wallet} label="درآمد امروز" value={formatToman(summary.revenue)} tone="brand" />
      <StatTile icon={ReceiptText} label="فاکتورهای امروز" value={formatNumber(summary.invoiceCount)} />
    </div>
  )
}
