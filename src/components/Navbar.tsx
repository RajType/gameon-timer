import { Clock } from 'lucide-react'
import { useNow } from '@/hooks/useNow'
import { formatClock, formatDate } from '@/lib/time'

interface NavbarProps {
  title: string
}

export function Navbar({ title }: NavbarProps) {
  const now = useNow()

  return (
    <header className="glass flex h-16 shrink-0 items-center gap-4 border-b border-separator px-6">
      <div className="leading-tight">
        <h1 className="text-[17px] font-semibold tracking-tight">{title}</h1>
        <p className="mt-0.5 text-xs text-label-secondary">{formatDate(now)}</p>
      </div>

      <div className="ms-auto flex items-center gap-2">
        <div className="flex h-8 items-center gap-2 rounded-full bg-white/[0.06] px-3 text-[13px] font-medium">
          <Clock className="size-3.5 text-label-secondary" strokeWidth={2} />
          <time dir="ltr" className="tabular-nums" dateTime={new Date(now).toISOString()}>
            {formatClock(now)}
          </time>
        </div>
      </div>
    </header>
  )
}
