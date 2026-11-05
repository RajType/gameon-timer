import { FolderInput, Pencil, Plus, ShoppingBag } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { BuffetOrderModal } from '@/components/buffet/BuffetOrderModal'
import { CategoryDot } from '@/components/buffet/CategoryDot'
import { ProductForm } from '@/components/buffet/ProductForm'
import { StockBadge } from '@/components/buffet/StockBadge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { Section } from '@/components/ui/Section'
import { errorMessage } from '@/lib/api'
import { categoryOf, filterByCategory, isAvailable, stockLevel, UNCATEGORIZED_LABEL, type CategoryFilter } from '@/lib/buffet'
import { cn } from '@/lib/cn'
import { formatNumber, formatToman } from '@/lib/currency'
import { useSettingsStore } from '@/store/settingsStore'
import { useStationStore } from '@/store/stationStore'
import { toastError, useUiStore } from '@/store/uiStore'
import type { Product } from '@/types'

function FilterChip({
  active,
  label,
  count,
  color,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  color?: string | null
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-colors',
        active ? 'border-brand/50 bg-brand/12 text-label' : 'border-separator text-label-secondary hover:text-label',
      )}
    >
      {color !== null && <CategoryDot color={color} />}
      {label}
      <span className="text-[11px] text-label-tertiary tabular-nums">{formatNumber(count)}</span>
    </button>
  )
}

/** Buffet list: filter by category, order onto an open session, item admin, bulk re-categorise. */
export function BuffetPage() {
  const products = useSettingsStore((s) => s.products)
  const categories = useSettingsStore((s) => s.categories)
  const assign = useSettingsStore((s) => s.assignProductsCategory)
  const openSessions = useStationStore((s) => Object.keys(s.sessions).length)
  const pushToast = useUiStore((s) => s.pushToast)
  const [filter, setFilter] = useState<CategoryFilter>('all')
  const [ordering, setOrdering] = useState<Product | null>(null)
  const [editing, setEditing] = useState<{ product?: Product } | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [target, setTarget] = useState<string>('none')
  const [moving, setMoving] = useState(false)
  const targetId = useId()

  // A filter pointing at a deleted category falls back to "all".
  const effectiveFilter: CategoryFilter =
    typeof filter === 'number' && !categories.some((c) => c.id === filter) ? 'all' : filter
  const visible = useMemo(() => filterByCategory(products, effectiveFilter), [products, effectiveFilter])
  const uncategorized = products.filter((p) => p.categoryId === null).length
  const soldOut = products.filter((p) => p.active && stockLevel(p) === 'out').length
  const low = products.filter((p) => p.active && stockLevel(p) === 'low').length
  const selectedVisible = visible.filter((p) => selected.has(p.id))
  const allVisibleSelected = visible.length > 0 && selectedVisible.length === visible.length

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const move = async () => {
    if (selectedVisible.length === 0 || moving) return
    setMoving(true)
    const categoryId = target === 'none' ? null : Number(target)
    try {
      await assign(
        selectedVisible.map((p) => p.id),
        categoryId,
      )
      const name = categoryId === null ? UNCATEGORIZED_LABEL : categories.find((c) => c.id === categoryId)?.name
      pushToast({ tone: 'success', title: 'دسته‌ی کالاها تغییر کرد', detail: `${formatNumber(selectedVisible.length)} کالا ← ${name}` })
      setSelected(new Set())
    } catch (error) {
      toastError('تغییر دسته انجام نشد', new Error(errorMessage(error)))
    } finally {
      setMoving(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      <Section
        title="بوفه"
        description={
          <>
            سفارش‌ها روی جلسه‌ی باز یک ایستگاه ثبت و در صورت‌حساب همان جلسه آورده می‌شوند.
            {(soldOut > 0 || low > 0) && (
              <span className="ms-1 text-status-paused">
                {soldOut > 0 && `${formatNumber(soldOut)} کالا ناموجود`}
                {soldOut > 0 && low > 0 && '، '}
                {low > 0 && `${formatNumber(low)} کالا رو به اتمام`}
              </span>
            )}
          </>
        }
        actions={
          <Button variant="primary" onClick={() => setEditing({})}>
            <Plus />
            کالای جدید
          </Button>
        }
      >
        <div role="radiogroup" aria-label="فیلتر دسته" className="flex flex-wrap items-center gap-2 border-b border-separator px-4 py-3">
          <FilterChip active={effectiveFilter === 'all'} label="همه" count={products.length} color={null} onClick={() => setFilter('all')} />
          {categories.map((category) => (
            <FilterChip
              key={category.id}
              active={effectiveFilter === category.id}
              label={category.name}
              count={category.productCount}
              color={category.color}
              onClick={() => setFilter(category.id)}
            />
          ))}
          <FilterChip
            active={effectiveFilter === 'none'}
            label={UNCATEGORIZED_LABEL}
            count={uncategorized}
            onClick={() => setFilter('none')}
          />
        </div>

        {selectedVisible.length > 0 && (
          <div role="toolbar" aria-label="تغییر دسته‌ی کالاهای انتخاب‌شده" className="flex items-center gap-3 border-b border-separator bg-brand/[0.06] px-4 py-2.5">
            <span className="text-[13px] font-medium tabular-nums">{formatNumber(selectedVisible.length)} کالا انتخاب شده</span>
            <label htmlFor={targetId} className="ms-auto text-xs text-label-secondary">
              انتقال به
            </label>
            <Select id={targetId} className="w-44" value={target} onChange={(e) => setTarget(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
              <option value="none">{UNCATEGORIZED_LABEL}</option>
            </Select>
            <Button size="sm" variant="primary" disabled={moving} onClick={() => void move()}>
              <FolderInput />
              اعمال
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              لغو
            </Button>
          </div>
        )}

        {openSessions === 0 && (
          <p role="status" className="border-b border-separator px-4 py-2.5 text-xs text-label-secondary">
            هیچ جلسه‌ی فعالی نیست؛ برای ثبت سفارش ابتدا یک جلسه را شروع کنید.
          </p>
        )}
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-separator text-xs text-label-tertiary">
              <th className="w-10 ps-4 pe-1 py-2.5 text-start">
                <input
                  type="checkbox"
                  aria-label="انتخاب همه‌ی کالاهای این فهرست"
                  checked={allVisibleSelected}
                  onChange={() =>
                    setSelected(allVisibleSelected ? new Set() : new Set(visible.map((p) => p.id)))
                  }
                  className="accent-brand"
                />
              </th>
              <th className="px-4 py-2.5 text-start font-medium">کالا</th>
              <th className="px-4 py-2.5 text-start font-medium">دسته</th>
              <th className="px-4 py-2.5 text-start font-medium">قیمت</th>
              <th className="px-4 py-2.5 text-start font-medium">موجودی</th>
              <th className="px-4 py-2.5 text-start font-medium">وضعیت</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {visible.map((product) => {
              const orderable = isAvailable(product) && openSessions > 0
              const category = categoryOf(product, categories)
              return (
                <tr
                  key={product.id}
                  data-product-id={product.id}
                  className={cn('border-b border-separator last:border-b-0', !product.active && 'text-label-secondary')}
                >
                  <td className="ps-4 pe-1 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`انتخاب ${product.name}`}
                      checked={selected.has(product.id)}
                      onChange={() => toggle(product.id)}
                      className="accent-brand"
                    />
                  </td>
                  <td className="px-4 py-2.5 font-medium">{product.name}</td>
                  <td className="px-4 py-2.5 text-label-secondary">
                    <span className="inline-flex items-center gap-1.5">
                      <CategoryDot color={category?.color} />
                      {category?.name ?? UNCATEGORIZED_LABEL}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-brand tabular-nums">{formatToman(product.price)}</td>
                  <td className="px-4 py-2.5">
                    <StockBadge product={product} />
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {product.active ? <span className="text-label-secondary">فعال</span> : <span className="text-status-maintenance">غیرفعال</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        disabled={!orderable}
                        title={
                          !product.active
                            ? 'کالا غیرفعال است'
                            : !isAvailable(product)
                              ? 'ناموجود'
                              : openSessions === 0
                                ? 'هیچ جلسه‌ی فعالی نیست'
                                : undefined
                        }
                        aria-label={`سفارش ${product.name}`}
                        onClick={() => setOrdering(product)}
                      >
                        <ShoppingBag />
                        سفارش
                      </Button>
                      <Button variant="ghost" size="sm" aria-label={`ویرایش ${product.name}`} onClick={() => setEditing({ product })}>
                        <Pencil />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="px-4 py-8 text-center text-[13px] text-label-secondary">کالایی در این دسته نیست.</p>
        )}
      </Section>

      {ordering && <BuffetOrderModal product={ordering} onClose={() => setOrdering(null)} />}
      {editing && (
        <ProductForm
          product={editing.product}
          defaultCategoryId={typeof effectiveFilter === 'number' ? effectiveFilter : null}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
