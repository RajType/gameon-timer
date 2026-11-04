import { useMemo } from 'react'
import { DashboardStats } from '@/components/DashboardStats'
import { StationCard } from '@/components/StationCard'
import { SegmentedControl, type SegmentedOption } from '@/components/ui/SegmentedControl'
import { countByStatus, getStationStatus } from '@/lib/station'
import { useStationStore } from '@/store/stationStore'
import { useUiStore, type StationFilter } from '@/store/uiStore'

export function Dashboard() {
  const stations = useStationStore((s) => s.stations)
  const sessions = useStationStore((s) => s.sessions)
  const filter = useUiStore((s) => s.stationFilter)
  const setFilter = useUiStore((s) => s.setStationFilter)

  const { visible, options } = useMemo(() => {
    const counts = countByStatus(stations, sessions)

    const options: SegmentedOption<StationFilter>[] = [
      { value: 'all', label: 'همه', count: stations.length },
      { value: 'running', label: 'در حال بازی', count: counts.running },
      { value: 'paused', label: 'متوقف', count: counts.paused },
      { value: 'available', label: 'آزاد', count: counts.available },
    ]

    const visible =
      filter === 'all' ? stations : stations.filter((s) => getStationStatus(s, sessions[s.id]) === filter)

    return { visible, options }
  }, [stations, sessions, filter])

  return (
    <div className="mx-auto flex max-w-[1680px] flex-col gap-6">
      <DashboardStats />

      <section aria-labelledby="stations-heading" className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <h2 id="stations-heading" className="text-[15px] font-semibold tracking-tight">
            ایستگاه‌ها
          </h2>
          <div className="ms-auto">
            <SegmentedControl
              aria-label="فیلتر وضعیت ایستگاه"
              options={options}
              value={filter}
              onChange={setFilter}
            />
          </div>
        </div>

        {visible.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {visible.map((station) => (
              <StationCard key={station.id} station={station} />
            ))}
          </div>
        ) : (
          <p className="glass rounded-2xl border border-separator py-12 text-center text-sm text-label-secondary">
            ایستگاهی با این وضعیت وجود ندارد.
          </p>
        )}
      </section>
    </div>
  )
}
