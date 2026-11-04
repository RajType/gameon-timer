import { Pencil, Plus } from 'lucide-react'
import { useId, useState } from 'react'
import { StationForm } from '@/components/admin/StationForm'
import { FloorMap } from '@/components/FloorMap'
import { Button } from '@/components/ui/Button'
import { Section } from '@/components/ui/Section'
import { Switch } from '@/components/ui/Switch'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatToman } from '@/lib/currency'
import { lowestRate, STATION_KIND_LABEL } from '@/lib/station'
import { useSettingsStore } from '@/store/settingsStore'
import { useStationStore } from '@/store/stationStore'
import { toastError, useUiStore } from '@/store/uiStore'
import type { Station } from '@/types'

type Editing = { mode: 'create' } | { mode: 'edit'; station: Station } | null

export function StationsPage() {
  const stations = useStationStore((s) => s.stations)
  const sessions = useStationStore((s) => s.sessions)
  const plans = useSettingsStore((s) => s.ratePlans)
  const setStationEnabled = useSettingsStore((s) => s.setStationEnabled)
  const [editing, setEditing] = useState<Editing>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const editLayout = useUiStore((s) => s.layoutEditing)
  const setEditLayout = useUiStore((s) => s.setLayoutEditing)
  const editLayoutId = useId()

  const toggle = async (station: Station, enabled: boolean) => {
    setToggling(station.id)
    try {
      await setStationEnabled(station.id, enabled)
    } catch (e) {
      toastError('تغییر وضعیت ایستگاه انجام نشد', new Error(errorMessage(e)))
    } finally {
      setToggling(null)
    }
  }

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      <Section
        title="ایستگاه‌ها"
        description={
          editLayout
            ? 'کارت‌ها را روی نقشه‌ی سالن بکشید (یا با صفحه‌کلید جابه‌جا کنید)؛ جای هر ایستگاه بلافاصله ذخیره می‌شود. دکمه‌های کارت در این حالت غیرفعال‌اند.'
            : 'افزودن، ویرایش و غیرفعال کردن ایستگاه‌ها. ایستگاه‌ها حذف نمی‌شوند تا سابقه‌ی فاکتورها حفظ شود.'
        }
        actions={
          <>
            <div className="flex h-9 items-center gap-2.5 rounded-[10px] bg-white/[0.06] ps-3 pe-1.5">
              <label htmlFor={editLayoutId} className="text-[13px] font-medium">
                ویرایش چیدمان
              </label>
              <Switch id={editLayoutId} label="ویرایش چیدمان" checked={editLayout} onChange={setEditLayout} />
            </div>
            <Button variant="primary" onClick={() => setEditing({ mode: 'create' })}>
              <Plus />
              ایستگاه جدید
            </Button>
          </>
        }
      >
        {editLayout ? (
          <div className="p-3">
            <FloorMap stations={stations} editable />
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-separator text-xs text-label-tertiary">
                <th className="px-4 py-2.5 text-start font-medium">نام</th>
                <th className="px-4 py-2.5 text-start font-medium">نوع</th>
                <th className="px-4 py-2.5 text-start font-medium">نرخ</th>
                <th className="px-4 py-2.5 text-start font-medium">وضعیت</th>
                <th className="px-4 py-2.5 text-end font-medium">فعال</th>
                <th className="w-12 px-2" />
              </tr>
            </thead>
            <tbody>
              {stations.map((station) => {
                const plan = plans.find((p) => p.id === station.ratePlanId)
                const open = Boolean(sessions[station.id])
                const from = lowestRate(plan)
                return (
                  <tr key={station.id} className={cn('border-b border-separator last:border-b-0', !station.enabled && 'text-label-secondary')}>
                    <td className="px-4 py-2.5 font-medium">{station.name}</td>
                    <td className="px-4 py-2.5">
                      <span dir="ltr" className="rounded bg-white/[0.07] px-1.5 py-0.5 text-[11px] font-semibold">
                        {STATION_KIND_LABEL[station.kind]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {plan?.name ?? '—'}
                      {from !== undefined && <span className="ms-2 text-xs text-gold tabular-nums">از {formatToman(from)}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {open ? (
                        <span className="text-status-running">جلسه‌ی باز</span>
                      ) : station.enabled ? (
                        <span className="text-label-secondary">آماده</span>
                      ) : (
                        <span className="text-status-maintenance">غیرفعال</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-end">
                      <Switch
                        label={`فعال بودن ${station.name}`}
                        checked={station.enabled}
                        disabled={toggling === station.id || (open && station.enabled)}
                        title={open ? 'ایستگاه جلسه‌ی باز دارد؛ ابتدا تسویه کنید.' : undefined}
                        onChange={(enabled) => void toggle(station, enabled)}
                      />
                    </td>
                    <td className="px-2 py-2.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`ویرایش ${station.name}`}
                        onClick={() => setEditing({ mode: 'edit', station })}
                      >
                        <Pencil />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Section>

      {editing && (
        <StationForm
          station={editing.mode === 'edit' ? editing.station : undefined}
          hasOpenSession={editing.mode === 'edit' && Boolean(sessions[editing.station.id])}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
