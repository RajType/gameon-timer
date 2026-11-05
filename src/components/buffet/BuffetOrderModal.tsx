import { Minus, Plus } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { maxOrderable, stockLabel } from '@/lib/buffet'
import { formatNumber, formatToman, toPersianDigits } from '@/lib/currency'
import { getStationStatus, STATION_STATUS_LABEL } from '@/lib/station'
import { useSettingsStore } from '@/store/settingsStore'
import { useStationStore } from '@/store/stationStore'
import { useUiStore } from '@/store/uiStore'
import type { Product } from '@/types'
import { Button } from '../ui/Button'
import { Field, Select } from '../ui/Field'
import { Modal } from '../ui/Modal'

/**
 * Order one buffet item for a station. Only stations with an open session are
 * offered (the backend rejects anything else), and the quantity is capped by
 * the stock on hand.
 */
export function BuffetOrderModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const stations = useStationStore((s) => s.stations)
  const sessions = useStationStore((s) => s.sessions)
  const addOrderItem = useStationStore((s) => s.addOrderItem)
  const pushToast = useUiStore((s) => s.pushToast)
  // Live copy: stock changes while the dialog is open (e.g. sold from a card).
  const item = useSettingsStore((s) => s.products.find((p) => p.id === product.id)) ?? product
  const stationField = useId()

  const open = stations.filter((station) => sessions[station.id])
  const [stationId, setStationId] = useState(open[0]?.id ?? '')
  const selected = open.find((s) => s.id === stationId) ?? open[0]
  const max = maxOrderable(item)
  const [requested, setRequested] = useState(1)
  const quantity = Math.min(Math.max(1, requested), Math.max(1, max))
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false) // a double click can land before `disabled` renders

  const canOrder = Boolean(selected) && max >= 1 && !saving

  const submit = async () => {
    if (!selected || savingRef.current || max < 1) return
    savingRef.current = true
    setSaving(true)
    const ok = await addOrderItem(selected.id, item.id, quantity)
    if (ok) {
      pushToast({
        tone: 'success',
        title: 'سفارش بوفه ثبت شد',
        detail: `${toPersianDigits(quantity)} × ${item.name}، ${selected.name}`,
      })
      onClose()
    } else {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      title={item.name}
      subtitle="سفارش بوفه"
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button variant="primary" size="lg" className="flex-1" disabled={!canOrder} onClick={() => void submit()}>
            ثبت سفارش
          </Button>
          <Button size="lg" onClick={onClose} disabled={saving}>
            انصراف
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2.5 text-[13px]">
          <span className="text-brand tabular-nums">{formatToman(item.price)}</span>
          <span className="text-label-secondary">موجودی: {stockLabel(item)}</span>
        </div>

        {open.length === 0 ? (
          <p role="alert" className="rounded-xl bg-status-paused/10 px-3 py-2.5 text-[13px] leading-6 text-status-paused">
            هیچ جلسه‌ی فعالی نیست. سفارش بوفه فقط روی جلسه‌ی باز یک ایستگاه ثبت می‌شود؛ ابتدا یک جلسه را شروع کنید.
          </p>
        ) : (
          <Field label="ایستگاه" htmlFor={stationField} hint="فقط ایستگاه‌های دارای جلسه‌ی باز">
            <Select id={stationField} value={selected?.id ?? ''} onChange={(e) => setStationId(e.target.value)}>
              {open.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name} — {STATION_STATUS_LABEL[getStationStatus(station, sessions[station.id])]}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-label-secondary">تعداد</span>
          <div className="flex items-center gap-1" role="group" aria-label="تعداد">
            <Button size="sm" aria-label="کم کردن تعداد" disabled={quantity <= 1} onClick={() => setRequested(quantity - 1)}>
              <Minus />
            </Button>
            <output aria-live="polite" className="w-10 text-center text-base font-semibold tabular-nums">
              {formatNumber(quantity)}
            </output>
            <Button size="sm" aria-label="افزودن تعداد" disabled={quantity >= max} onClick={() => setRequested(quantity + 1)}>
              <Plus />
            </Button>
          </div>
        </div>
        {item.stockQuantity !== null && max > 0 && (
          <p className="-mt-2 text-xs text-label-tertiary">حداکثر {toPersianDigits(max)} عدد</p>
        )}

        <div className="flex items-baseline justify-between border-t border-separator pt-3">
          <span className="text-sm font-medium">جمع</span>
          <span data-testid="order-total" className="text-xl font-bold text-brand tabular-nums">
            {formatToman(item.price * quantity)}
          </span>
        </div>
      </div>
    </Modal>
  )
}
