import { Coffee, Minus, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { BUFFET_MENU } from '@/data/seed'
import { formatNumber, formatToman } from '@/lib/currency'
import { useStationStore } from '@/store/stationStore'
import { Button } from './ui/Button'

interface BuffetQuickAddProps {
  stationId: string
}

/** Compact popover for adding buffet items to a station's open tab. */
export function BuffetQuickAdd({ stationId }: BuffetQuickAddProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const lines = useStationStore((s) => s.sessions[stationId]?.buffet)
  const addBuffetItem = useStationStore((s) => s.addBuffetItem)
  const removeBuffetItem = useStationStore((s) => s.removeBuffetItem)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const itemCount = lines?.reduce((sum, line) => sum + line.quantity, 0) ?? 0

  return (
    <div ref={rootRef} className="relative">
      <Button
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="افزودن از بوفه"
        title="بوفه"
        onClick={() => setOpen((value) => !value)}
        className="relative"
      >
        <Coffee />
        {itemCount > 0 && (
          <span className="text-[11px] text-label-secondary tabular-nums">{formatNumber(itemCount)}</span>
        )}
      </Button>

      {open && (
        // Solid surface: the card already applies backdrop-filter, and nested
        // backdrop filters can't sample neighbouring cards, so glass would leak.
        <div className="absolute start-0 top-full z-30 mt-2 w-64 rounded-2xl border border-white/10 bg-surface-raised p-1.5 shadow-2xl shadow-black/60 motion-safe:animate-pop-in">
          <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-medium text-label-tertiary">بوفه</p>
          <ul className="flex max-h-72 flex-col overflow-y-auto">
            {BUFFET_MENU.map((item) => {
              const quantity = lines?.find((line) => line.itemId === item.id)?.quantity ?? 0
              return (
                <li key={item.id} className="flex h-9 items-center gap-2 rounded-lg ps-2.5 pe-1 hover:bg-white/[0.06]">
                  <span className="min-w-0 flex-1 truncate text-[13px]">{item.name}</span>
                  <span className="text-xs text-gold tabular-nums">{formatToman(item.price)}</span>
                  {/* Fixed width keeps the price column aligned as controls appear. */}
                  <div className="flex w-[4.5rem] items-center justify-end">
                    {quantity > 0 && (
                      <>
                        <button
                          type="button"
                          aria-label={`کم کردن ${item.name}`}
                          onClick={() => removeBuffetItem(stationId, item.id)}
                          className="grid size-7 place-items-center rounded-md text-label-secondary hover:bg-white/[0.08] hover:text-label"
                        >
                          <Minus className="size-3.5" />
                        </button>
                        <span className="w-4 text-center text-xs font-semibold tabular-nums">
                          {formatNumber(quantity)}
                        </span>
                      </>
                    )}
                    <button
                      type="button"
                      aria-label={`افزودن ${item.name}`}
                      onClick={() => addBuffetItem(stationId, item)}
                      className="grid size-7 place-items-center rounded-md text-label-secondary hover:bg-white/[0.08] hover:text-label"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
