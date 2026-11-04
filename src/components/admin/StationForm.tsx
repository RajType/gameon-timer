import { useId, useState } from 'react'
import { errorMessage } from '@/lib/api'
import { formatNumber, toPersianDigits } from '@/lib/currency'
import { STATION_KIND_LABEL, STATION_KINDS } from '@/lib/station'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import type { Station, StationKind } from '@/types'
import { Button } from '../ui/Button'
import { Field, Select, TextInput } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { SegmentedControl } from '../ui/SegmentedControl'
import { Switch } from '../ui/Switch'

interface StationFormProps {
  /** `undefined` → create. */
  station?: Station
  hasOpenSession: boolean
  onClose: () => void
}

export function StationForm({ station, hasOpenSession, onClose }: StationFormProps) {
  const plans = useSettingsStore((s) => s.ratePlans)
  const createStation = useSettingsStore((s) => s.createStation)
  const updateStation = useSettingsStore((s) => s.updateStation)
  const pushToast = useUiStore((s) => s.pushToast)
  const ids = { name: useId(), plan: useId(), enabled: useId() }

  const [name, setName] = useState(station?.name ?? '')
  const [kind, setKind] = useState<StationKind>(station?.kind ?? 'ps5')
  const [ratePlanId, setRatePlanId] = useState(station?.ratePlanId ?? plans[0]?.id ?? '')
  const [enabled, setEnabled] = useState(station?.enabled ?? true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const plan = plans.find((p) => p.id === ratePlanId)
  const nameError = name.trim() === '' ? 'نام ایستگاه را وارد کنید.' : null

  const submit = async () => {
    if (nameError) {
      setError(nameError)
      return
    }
    setSaving(true)
    setError(null)
    const input = { name, kind, ratePlanId, enabled }
    try {
      if (station) await updateStation(station.id, input)
      else await createStation(input)
      pushToast({ tone: 'success', title: station ? 'ایستگاه ذخیره شد' : 'ایستگاه اضافه شد', detail: name.trim() })
      onClose()
    } catch (e) {
      setError(errorMessage(e))
      setSaving(false)
    }
  }

  return (
    <Modal
      title={station ? 'ویرایش ایستگاه' : 'ایستگاه جدید'}
      subtitle={station?.name}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button variant="primary" size="lg" className="flex-1" disabled={saving} onClick={() => void submit()}>
            {station ? 'ذخیره' : 'افزودن ایستگاه'}
          </Button>
          <Button size="lg" onClick={onClose} disabled={saving}>
            انصراف
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Field label="نام" htmlFor={ids.name}>
          <TextInput
            id={ids.name}
            value={name}
            maxLength={40}
            autoFocus
            placeholder="مثلاً ایستگاه ۱۱"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-label-secondary">نوع</span>
          <SegmentedControl
            aria-label="نوع ایستگاه"
            options={STATION_KINDS.map((k) => ({ value: k, label: STATION_KIND_LABEL[k] }))}
            value={kind}
            onChange={setKind}
          />
        </div>

        <Field
          label="نرخ"
          htmlFor={ids.plan}
          hint={
            plan
              ? plan.tiers
                  .map((t) => `${toPersianDigits(t.controllers)} دسته: ${formatNumber(t.hourlyRate)}`)
                  .join('، ') + ' تومان در ساعت'
              : undefined
          }
        >
          <Select id={ids.plan} value={ratePlanId} onChange={(event) => setRatePlanId(event.target.value)}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        {station && hasOpenSession && (
          <p className="-mt-2 text-xs leading-5 text-label-tertiary">
            جلسه‌ی باز این ایستگاه با نرخ زمان شروع خود ادامه می‌یابد؛ نرخ جدید از جلسه‌ی بعد اعمال می‌شود.
          </p>
        )}

        <div className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2.5">
          <label htmlFor={ids.enabled} className="text-[13px]">
            فعال
            <span className="block text-xs text-label-tertiary">ایستگاه غیرفعال در داشبورد «خارج از سرویس» نمایش داده می‌شود.</span>
          </label>
          <Switch
            id={ids.enabled}
            label="فعال"
            checked={enabled}
            disabled={hasOpenSession && enabled}
            title={hasOpenSession ? 'ایستگاه جلسه‌ی باز دارد' : undefined}
            onChange={setEnabled}
          />
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-status-maintenance/10 px-3 py-2.5 text-[13px] text-status-maintenance">
            {error}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
