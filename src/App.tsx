import { InvoiceModal } from '@/components/InvoiceModal'
import { Navbar } from '@/components/Navbar'
import { Sidebar } from '@/components/Sidebar'
import { Dashboard } from '@/pages/Dashboard'

export default function App() {
  return (
    <div className="flex h-full">
      {/* First in DOM → rendered on the right in RTL. */}
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar title="داشبورد" />
        <main className="flex-1 overflow-y-auto px-6 pt-5 pb-8">
          <Dashboard />
        </main>
      </div>

      <InvoiceModal />
    </div>
  )
}
