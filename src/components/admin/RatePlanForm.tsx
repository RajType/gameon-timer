import { Plus, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { errorMessage } from '@/lib/api'
import { toPersianDigits } from '@/lib/currency'
import { MAX_CONTROLLERS, sortTiers, validateTiers } from '@/lib/rates'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import type { RatePlan } from '@/types'
import { Button } from '../ui/Button'
import { Field, Select, TextInput } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { MoneyInput } from '../ui/MoneyInput'

interface TierDraft {
  key: number
  controllers: number
  hourlyRate: number | null
}

let nextKey = 1

export function RatePlanForm({ plan, onClose }: { plan?: RatePlan; onClose: () => void }) {
  const createRatePlan = useSettingsStore((s) => s.createRatePlan)
  const updateRatePlan = useSettingsStore((s) => s.updateRatePlan)
  const pushToast = useUiStore((s) => s.pushToast)
  const nameId = useId()

  const [name, setName] = useState(plan?.name ?? '')
  const [tiers, setTiers] = useState<TierDraft[]>(
    plan?.tiers.map((t) => ({ key: nextKey++, ...t })) ?? [
      { key: nextKey++, controllers: 1, hourlyRate: null },
      { key: nextKey++, controllers: 2, hourlyRate: null },
    ],
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const update = (key: number, patch: Partial<TierDraft>) =>
    setTiers((list) => list.map((t) => (t.key === key ? { ...t, ...patch } : t)))

  const addTier = () => {
    const used = new Set(tiers.map((t) => t.controllers))
    const next = Array.from({ length: MAX_CONTROLLERS }, (_, i) => i + 1).find((n) => !used.has(n))
    if (next === undefined) return
    const last = tiers.at(-1)?.hourlyRate ?? null
    setTiers((list) => [...list, { key: nextKey++, controllers: next, hourlyRate: last }])
  }

  const submit = async () => {
    const problem = name.trim() === '' ? 'نام نرخ را وارد کنید.' : validateTiers(tiers)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    const input = {
      name,
      tiers: sortTiers(tiers.map((t) => ({ controllers: t.controllers, hourlyRate: t.hourlyRate ?? 0 }))),
    }
    try {
      if (plan) await updateRatePlan(plan.id, input)
      else await createRatePlan(input)
      pushToast({ tone: 'success', title: plan ? 'نرخ ذخیره شد' : 'نرخ جدید اضافه شد', detail: 'برای جلسه‌های جدید اعمال می‌شود.' })
      onClose()
    } catch (e) {
      setError(errorMessage(e))
      setSaving(false)
    }
  }

  return (
    <Modal
      title={plan ? 'ویرایش نرخ' : 'نرخ جدید'}
      subtitle={plan?.name}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button variant="primary" size="lg" className="flex-1" disabled={saving} onClick={() => void submit()}>
            ذخیره
          </Button>
          <Button size="lg" onClick={onClose} disabled={saving}>
            انصراف
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="نام" htmlFor={nameId}>
          <TextInput id={nameId} value={name} maxLength={40} autoFocus placeholder="مثلاً PS5 آخر هفته" onChange={(e) => setName(e.target.value)} />
        </Field>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-label-secondary">نرخ ساعتی بر اساس تعداد دسته</span>
            <Button size="sm" variant="ghost" onClick={addTier} disabled={tiers.length >= MAX_CONTROLLERS}>
              <Plus />
              افزودن ردیف
            </Button>
          </div>
          <ul className="flex flex-col gap-2">
            {tiers.map((tier) => (
              <li key={tier.key} className="flex items-center gap-2">
                <Select
                  aria-label="تعداد دسته"
                  className="w-28 shrink-0"
                  value={tier.controllers}
                  onChange={(e) => update(tier.key, { controllers: Number(e.target.value) })}
                >
                  {Array.from({ length: MAX_CONTROLLERS }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {toPersianDigits(n)} دسته
                    </option>
                  ))}
                </Select>
                <MoneyInput
                  className="flex-1"
                  aria-label={`نرخ ساعتی ${toPersianDigits(tier.controllers)} دسته`}
                  value={tier.hourlyRate}
                  invalid={tier.hourlyRate === null}
                  onChange={(hourlyRate) => update(tier.key, { hourlyRate })}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="حذف ردیف"
                  disabled={tiers.length <= 1}
                  onClick={() => setTiers((list) => list.filter((t) => t.key !== tier.key))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-5 text-label-tertiary">
            تغییر نرخ فقط روی جلسه‌های جدید اثر دارد. جلسه‌های باز و فاکتورهای ثبت‌شده با نرخ زمان خود باقی می‌مانند.
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-status-maintenance/10 px-3 py-2.5 text-[13px] text-status-maintenance">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
