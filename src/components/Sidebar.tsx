import {
  ChartColumn,
  Coffee,
  DatabaseBackup,
  Gamepad2,
  LayoutGrid,
  Map as MapIcon,
  ReceiptText,
  Settings,
  Tags,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { toPersianDigits } from '@/lib/currency'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore, type View } from '@/store/uiStore'

interface NavItem {
  key: string
  label: string
  icon: LucideIcon
  /** Views that exist; others render disabled ("soon"). */
  view?: View
}

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'عملیات',
    items: [
      { key: 'dashboard', label: 'داشبورد', icon: LayoutGrid, view: 'dashboard' },
      { key: 'floor', label: 'نقشه‌ی سالن', icon: MapIcon, view: 'floor' },
      { key: 'buffet', label: 'بوفه', icon: Coffee, view: 'buffet' },
      { key: 'invoices', label: 'فاکتورها', icon: ReceiptText },
      { key: 'reports', label: 'گزارش‌ها', icon: ChartColumn },
    ],
  },
  {
    title: 'مدیریت',
    items: [
      { key: 'stations', label: 'ایستگاه‌ها', icon: Gamepad2, view: 'stations' },
      { key: 'rates', label: 'نرخ‌ها و دسته‌ها', icon: Tags, view: 'rates' },
      { key: 'settings', label: 'تنظیمات', icon: Settings, view: 'settings' },
      { key: 'data', label: 'داده و پشتیبان', icon: DatabaseBackup, view: 'data' },
    ],
  },
]

function NavButton({ item }: { item: NavItem }) {
  const current = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  const active = item.view !== undefined && item.view === current
  const Icon = item.icon
  return (
    <button
      type="button"
      disabled={!item.view}
      aria-current={active ? 'page' : undefined}
      title={item.view ? undefined : 'به‌زودی'}
      onClick={() => item.view && setView(item.view)}
      className={cn(
        'flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] font-medium transition-colors',
        active ? 'bg-white/[0.09] text-label' : 'text-label-secondary hover:bg-white/[0.05] hover:text-label',
        'disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-label-secondary',
      )}
    >
      <Icon className={cn('size-[18px]', active && 'text-brand')} strokeWidth={1.8} />
      <span>{item.label}</span>
      {!item.view && <span className="ms-auto text-[10px] text-label-tertiary">به‌زودی</span>}
    </button>
  )
}

export function Sidebar() {
  const storeName = useSettingsStore((s) => s.settings?.storeName) || 'گیم‌آن'
  const logoUrl = useSettingsStore((s) => s.logoUrl)
  return (
    <aside className="glass flex w-60 shrink-0 flex-col border-e border-separator">
      <div className="flex h-16 items-center gap-3 px-4">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="size-9 shrink-0 rounded-[10px] bg-white/[0.06] object-contain" />
        ) : (
          <div className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-gradient-to-b from-brand-300 to-brand-600 text-brand-contrast shadow-brand">
            <Gamepad2 className="size-5" strokeWidth={2} />
          </div>
        )}
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[15px] font-bold tracking-tight">{storeName}</p>
          <p className="text-[11px] text-label-secondary">مدیریت کنسول‌سنتر</p>
        </div>
      </div>

      <nav aria-label="منوی اصلی" className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pt-2">
        {SECTIONS.map((section) => (
          <div key={section.title} className="flex flex-col gap-0.5">
            <p className="px-2.5 pb-1.5 text-[11px] font-medium text-label-tertiary">{section.title}</p>
            {section.items.map((item) => (
              <NavButton key={item.key} item={item} />
            ))}
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2 border-t border-separator px-5 py-3 text-[11px] text-label-tertiary">
        <span aria-hidden className="size-1.5 rounded-full bg-status-running" />
        <span>ذخیره در پایگاه داده‌ی محلی</span>
        <span className="ms-auto tabular-nums">نسخه {toPersianDigits('0.2.0')}</span>
      </div>
    </aside>
  )
}
