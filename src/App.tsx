import { useEffect, type ReactNode } from 'react'
import { BootScreen } from '@/components/BootScreen'
import { InvoiceModal } from '@/components/InvoiceModal'
import { Navbar } from '@/components/Navbar'
import { Sidebar } from '@/components/Sidebar'
import { Toaster } from '@/components/Toaster'
import { useSessionAlerts } from '@/hooks/useSessionAlerts'
import { unlockAudio } from '@/lib/sound'
import { Dashboard } from '@/pages/Dashboard'
import { BuffetPage } from '@/pages/BuffetPage'
import { DataPage } from '@/pages/DataPage'
import { FloorPage } from '@/pages/FloorPage'
import { RatesPage } from '@/pages/RatesPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { StationsPage } from '@/pages/StationsPage'
import { useAppStore } from '@/store/appStore'
import { useUiStore, type View } from '@/store/uiStore'

const VIEWS: Record<View, { title: string; render: () => ReactNode }> = {
  dashboard: { title: 'داشبورد', render: () => <Dashboard /> },
  floor: { title: 'نقشه‌ی سالن', render: () => <FloorPage /> },
  buffet: { title: 'بوفه', render: () => <BuffetPage /> },
  stations: { title: 'ایستگاه‌ها', render: () => <StationsPage /> },
  rates: { title: 'نرخ‌ها و دسته‌ها', render: () => <RatesPage /> },
  settings: { title: 'تنظیمات', render: () => <SettingsPage /> },
  data: { title: 'داده و پشتیبان', render: () => <DataPage /> },
}

function Shell() {
  const view = useUiStore((s) => s.view)
  const current = VIEWS[view] ?? VIEWS.dashboard
  useSessionAlerts()

  return (
    <div className="flex h-full">
      {/* First in DOM → rendered on the right in RTL. */}
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar title={current.title} />
        {/* Stable gutter: a toggling scrollbar would resize the live map, rescale it and toggle again. */}
        <main className="flex-1 overflow-y-auto px-6 pt-5 pb-8 [scrollbar-gutter:stable]">{current.render()}</main>
      </div>

      <InvoiceModal />
    </div>
  )
}

export default function App() {
  const phase = useAppStore((s) => s.phase)
  const bootstrap = useAppStore((s) => s.bootstrap)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  // WebViews keep AudioContext suspended until a user gesture.
  useEffect(() => {
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  return (
    <>
      {phase === 'ready' ? <Shell /> : <BootScreen />}
      <Toaster />
    </>
  )
}
