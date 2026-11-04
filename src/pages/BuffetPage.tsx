import { Pencil, Plus, ShoppingBag } from 'lucide-react'
import { useState } from 'react'
import { BuffetOrderModal } from '@/components/buffet/BuffetOrderModal'
import { ProductForm } from '@/components/buffet/ProductForm'
import { StockBadge } from '@/components/buffet/StockBadge'
import { Button } from '@/components/ui/Button'
import { Section } from '@/components/ui/Section'
import { isAvailable, PRODUCT_CATEGORY_LABEL, stockLevel } from '@/lib/buffet'
import { cn } from '@/lib/cn'
import { formatNumber, formatToman } from '@/lib/currency'
import { useSettingsStore } from '@/store/settingsStore'
import { useStationStore } from '@/store/stationStore'
import type { Product } from '@/types'

/** Buffet list: items with price and stock, ordering onto an open session, item admin. */
export function BuffetPage() {
  const products = useSettingsStore((s) => s.products)
  const openSessions = useStationStore((s) => Object.keys(s.sessions).length)
  const [ordering, setOrdering] = useState<Product | null>(null)
  const [editing, setEditing] = useState<{ product?: Product } | null>(null)

  const soldOut = products.filter((p) => p.active && stockLevel(p) === 'out').length
  const low = products.filter((p) => p.active && stockLevel(p) === 'low').length

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
        {openSessions === 0 && (
          <p role="status" className="border-b border-separator px-4 py-2.5 text-xs text-label-secondary">
            هیچ جلسه‌ی فعالی نیست؛ برای ثبت سفارش ابتدا یک جلسه را شروع کنید.
          </p>
        )}
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-separator text-xs text-label-tertiary">
              <th className="px-4 py-2.5 text-start font-medium">کالا</th>
              <th className="px-4 py-2.5 text-start font-medium">دسته</th>
              <th className="px-4 py-2.5 text-start font-medium">قیمت</th>
              <th className="px-4 py-2.5 text-start font-medium">موجودی</th>
              <th className="px-4 py-2.5 text-start font-medium">وضعیت</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const orderable = isAvailable(product) && openSessions > 0
              return (
                <tr
                  key={product.id}
                  data-product-id={product.id}
                  className={cn('border-b border-separator last:border-b-0', !product.active && 'text-label-secondary')}
                >
                  <td className="px-4 py-2.5 font-medium">{product.name}</td>
                  <td className="px-4 py-2.5 text-label-secondary">{PRODUCT_CATEGORY_LABEL[product.category]}</td>
                  <td className="px-4 py-2.5 text-gold tabular-nums">{formatToman(product.price)}</td>
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
      </Section>

      {ordering && <BuffetOrderModal product={ordering} onClose={() => setOrdering(null)} />}
      {editing && <ProductForm product={editing.product} onClose={() => setEditing(null)} />}
    </div>
  )
}
