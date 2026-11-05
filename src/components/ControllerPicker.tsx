import { Check, Gamepad2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatToman, toPersianDigits } from '@/lib/currency'
import { useStationStore } from '@/store/stationStore'
import type { Session } from '@/types'
import { Popover } from './ui/Popover'

/**
 * Change how many controllers a session uses. The running segment is split
 * at this moment, so each part is billed at the rate agreed for its count.
 */
export function ControllerPicker({ session }: { session: Session }) {
  const setControllers = useStationStore((s) => s.setControllers)
  const busy = useStationStore((s) => Boolean(s.pending[session.stationId]))

  return (
    <Popover
      label="تعداد دسته"
      title="تعداد دسته · نرخ ساعتی"
      width="w-56"
      align="end"
      buttonClassName="h-7 gap-1 rounded-full px-2 text-xs"
      trigger={
        // Compact on purpose: the card header also carries the hourly rate.
        <>
          <Gamepad2 className="!size-3.5 text-label-secondary" />
          <span className="tabular-nums">{toPersianDigits(session.controllers)}</span>
          <span className="sr-only">دسته</span>
        </>
      }
    >
      {(close) => (
        <ul className="flex flex-col">
          {session.rates.map((tier) => {
            const active = tier.controllers === session.controllers
            return (
              <li key={tier.controllers}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  disabled={busy}
                  onClick={() => {
                    if (!active) void setControllers(session.stationId, tier.controllers)
                    close()
                  }}
                  className={cn(
                    'flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-[13px] hover:bg-white/[0.06] disabled:opacity-40',
                    active && 'text-label',
                  )}
                >
                  <Check className={cn('size-3.5 text-brand', !active && 'invisible')} />
                  <span className="tabular-nums">{toPersianDigits(tier.controllers)} دسته</span>
                  <span className="ms-auto text-xs text-brand tabular-nums">{formatToman(tier.hourlyRate)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Popover>
  )
}
