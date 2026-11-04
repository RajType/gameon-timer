import { Coffee, Minus, Plus } from 'lucide-react'
import { useMemo } from 'react'
import { isAvailable, stockLabel, stockLevel } from '@/lib/buffet'
import { cn } from '@/lib/cn'
import { formatNumber, formatToman } from '@/lib/currency'
import { useSettingsStore } from '@/store/settingsStore'
import { useStationStore } from '@/store/stationStore'
import { Popover } from './ui/Popover'

interface BuffetQuickAddProps {
  stationId: string
}

/** Compact popover for adding buffet items to a station's open tab. */
export function BuffetQuickAdd({ stationId }: BuffetQuickAddProps) {
  const orders = useStationStore((s) => s.sessions[stationId]?.orders)
  const busy = useStationStore((s) => Boolean(s.pending[stationId]))
  const addOrderItem = useStationStore((s) => s.addOrderItem)
  const removeOrderItem = useStationStore((s) => s.removeOrderItem)
  const allProducts = useSettingsStore((s) => s.products)
  const products = useMemo(() => allProducts.filter((p) => p.active), [allProducts])

  const quantities = useMemo(() => {
    const map = new Map<string, number>()
    for (const line of orders ?? []) {
      if (line.productId) map.set(line.productId, (map.get(line.productId) ?? 0) + line.quantity)
    }
    return map
  }, [orders])
  const itemCount = orders?.reduce((sum, line) => sum + line.quantity, 0) ?? 0

  return (
    <Popover
      label="افزودن از بوفه"
      title="بوفه"
      width="w-64"
      trigger={
        <>
          <Coffee />
          {itemCount > 0 && (
            <span className="text-[11px] text-label-secondary tabular-nums">{formatNumber(itemCount)}</span>
          )}
        </>
      }
    >
      <ul className="flex max-h-72 flex-col overflow-y-auto">
        {products.map((item) => {
          const quantity = quantities.get(item.id) ?? 0
          const level = stockLevel(item)
          return (
            <li key={item.id} className="flex h-9 items-center gap-2 rounded-lg ps-2.5 pe-1 hover:bg-white/[0.06]">
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {item.name}
                {level !== 'uncounted' && (
                  <span
                    className={cn(
                      'ms-1.5 text-[10px] tabular-nums',
                      level === 'out' ? 'text-status-maintenance' : level === 'low' ? 'text-status-paused' : 'text-label-tertiary',
                    )}
                  >
                    {stockLabel(item)}
                  </span>
                )}
              </span>
              <span className="text-xs text-gold tabular-nums">{formatToman(item.price)}</span>
              {/* Fixed width keeps the price column aligned as controls appear. */}
              <div className="flex w-[4.5rem] items-center justify-end">
                {quantity > 0 && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`کم کردن ${item.name}`}
                      onClick={() => void removeOrderItem(stationId, item.id)}
                      className="grid size-7 place-items-center rounded-md text-label-secondary hover:bg-white/[0.08] hover:text-label disabled:opacity-40"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-4 text-center text-xs font-semibold tabular-nums">{formatNumber(quantity)}</span>
                  </>
                )}
                <button
                  type="button"
                  disabled={busy || !isAvailable(item)}
                  aria-label={`افزودن ${item.name}`}
                  onClick={() => void addOrderItem(stationId, item.id)}
                  className="grid size-7 place-items-center rounded-md text-label-secondary hover:bg-white/[0.08] hover:text-label disabled:opacity-40"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </Popover>
  )
}
