import { Activity, ReceiptText, Timer, Wallet } from 'lucide-react'
import { useNow } from '@/hooks/useNow'
import { getSessionCharges } from '@/lib/billing'
import { formatNumber, formatToman, formatTotal } from '@/lib/currency'
import { isSameLocalDay } from '@/lib/time'
import { useStationStore } from '@/store/stationStore'
import { StatTile } from './StatTile'

/** KPI strip. Ticks every second on its own so the station grid doesn't. */
export function DashboardStats() {
  const now = useNow()
  const stations = useStationStore((s) => s.stations)
  const sessions = useStationStore((s) => s.sessions)
  const invoices = useStationStore((s) => s.invoices)

  const open = Object.values(sessions)
  const inService = stations.filter((station) => !station.outOfService).length
  const openTotal = open.reduce((sum, session) => sum + getSessionCharges(session, now).subtotal, 0)

  let todayCount = 0
  let todayRevenue = 0
  for (const invoice of invoices) {
    if (!isSameLocalDay(invoice.endedAt, now)) continue
    todayCount += 1
    todayRevenue += invoice.total
  }

  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <StatTile
        icon={Activity}
        label="ایستگاه‌های فعال"
        value={`${formatNumber(open.length)} از ${formatNumber(inService)}`}
      />
      <StatTile icon={Timer} label="مبلغ جلسات باز" value={formatTotal(openTotal)} tone="gold" />
      <StatTile icon={Wallet} label="درآمد امروز" value={formatToman(todayRevenue)} tone="gold" />
      <StatTile icon={ReceiptText} label="فاکتورهای امروز" value={formatNumber(todayCount)} />
    </div>
  )
}
