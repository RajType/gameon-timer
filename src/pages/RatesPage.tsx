import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { RatePlanForm } from '@/components/admin/RatePlanForm'
import { Button } from '@/components/ui/Button'
import { formatNumber, toPersianDigits } from '@/lib/currency'
import { useSettingsStore } from '@/store/settingsStore'
import type { RatePlan } from '@/types'

type Editing = { plan?: RatePlan } | null

export function RatesPage() {
  const plans = useSettingsStore((s) => s.ratePlans)
  const [editing, setEditing] = useState<Editing>(null)

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
      <div className="flex items-end gap-3 px-1">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">نرخ‌ها و دسته‌ها</h2>
          <p className="mt-0.5 text-xs leading-5 text-label-secondary">
            هر ایستگاه یک نرخ دارد؛ قیمت هر ساعت بر اساس تعداد دسته‌ی در حال استفاده تعیین می‌شود. نرخ هر جلسه هنگام شروع ثبت می‌شود.
          </p>
        </div>
        <Button variant="primary" className="ms-auto" onClick={() => setEditing({})}>
          <Plus />
          نرخ جدید
        </Button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
        {plans.map((plan) => (
          <article key={plan.id} aria-label={plan.name} className="glass flex flex-col rounded-[20px] border border-separator p-4 shadow-glass">
            <header className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-[15px] font-semibold">{plan.name}</h3>
                <p className="mt-0.5 text-xs text-label-secondary">
                  {plan.stationCount > 0 ? `${formatNumber(plan.stationCount)} ایستگاه` : 'بدون ایستگاه'}
                </p>
              </div>
              <Button variant="ghost" size="sm" aria-label={`ویرایش ${plan.name}`} onClick={() => setEditing({ plan })}>
                <Pencil />
              </Button>
            </header>
            <dl className="mt-3 flex flex-col divide-y divide-separator rounded-xl bg-white/[0.03]">
              {plan.tiers.map((tier) => (
                <div key={tier.controllers} className="flex items-baseline justify-between px-3 py-2 text-[13px]">
                  <dt className="text-label-secondary">{toPersianDigits(tier.controllers)} دسته</dt>
                  <dd className="font-medium text-brand tabular-nums">
                    {formatNumber(tier.hourlyRate)} <span className="text-xs text-label-tertiary">تومان / ساعت</span>
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>

      {editing && <RatePlanForm plan={editing.plan} onClose={() => setEditing(null)} />}
    </div>
  )
}
