import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { DEFAULT_STATIONS } from '@/data/seed'
import { buildInvoice } from '@/lib/billing'
import type { BuffetItem, Invoice, Session, Station } from '@/types'

interface StationState {
  stations: Station[]
  /** Open sessions keyed by station id — guarantees one session per station. */
  sessions: Record<string, Session>
  /** Closed invoices, oldest first. */
  invoices: Invoice[]
  nextInvoiceNumber: number
}

interface StationActions {
  startSession: (stationId: string) => void
  pauseSession: (stationId: string) => void
  resumeSession: (stationId: string) => void
  addBuffetItem: (stationId: string, item: BuffetItem) => void
  /** Decrements the quantity by one; drops the line at zero. */
  removeBuffetItem: (stationId: string, itemId: string) => void
  /** Closes the session at `endedAt` and records its invoice. */
  checkout: (stationId: string, endedAt: number) => Invoice | null
}

export type StationStore = StationState & StationActions

/** Return a copy of `sessions` with one entry replaced or removed. */
function withSession(
  sessions: Record<string, Session>,
  stationId: string,
  next: Session | null,
): Record<string, Session> {
  const copy = { ...sessions }
  if (next) copy[stationId] = next
  else delete copy[stationId]
  return copy
}

export const useStationStore = create<StationStore>()(
  persist(
    (set, get) => ({
      stations: DEFAULT_STATIONS,
      sessions: {},
      invoices: [],
      nextInvoiceNumber: 1,

      startSession: (stationId) => {
        const { stations, sessions } = get()
        const station = stations.find((s) => s.id === stationId)
        if (!station || station.outOfService || sessions[stationId]) return

        const session: Session = {
          id: crypto.randomUUID(),
          stationId,
          startedAt: Date.now(),
          pausedAt: null,
          pausedMs: 0,
          hourlyRate: station.hourlyRate,
          buffet: [],
        }
        set({ sessions: withSession(sessions, stationId, session) })
      },

      pauseSession: (stationId) => {
        const { sessions } = get()
        const session = sessions[stationId]
        if (!session || session.pausedAt !== null) return
        set({ sessions: withSession(sessions, stationId, { ...session, pausedAt: Date.now() }) })
      },

      resumeSession: (stationId) => {
        const { sessions } = get()
        const session = sessions[stationId]
        if (!session || session.pausedAt === null) return
        const pausedFor = Math.max(0, Date.now() - session.pausedAt)
        set({
          sessions: withSession(sessions, stationId, {
            ...session,
            pausedAt: null,
            pausedMs: session.pausedMs + pausedFor,
          }),
        })
      },

      addBuffetItem: (stationId, item) => {
        const { sessions } = get()
        const session = sessions[stationId]
        if (!session) return

        const exists = session.buffet.some((line) => line.itemId === item.id)
        const buffet = exists
          ? session.buffet.map((line) =>
              line.itemId === item.id ? { ...line, quantity: line.quantity + 1 } : line,
            )
          : [...session.buffet, { itemId: item.id, name: item.name, unitPrice: item.price, quantity: 1 }]

        set({ sessions: withSession(sessions, stationId, { ...session, buffet }) })
      },

      removeBuffetItem: (stationId, itemId) => {
        const { sessions } = get()
        const session = sessions[stationId]
        if (!session) return

        const buffet = session.buffet
          .map((line) => (line.itemId === itemId ? { ...line, quantity: line.quantity - 1 } : line))
          .filter((line) => line.quantity > 0)

        set({ sessions: withSession(sessions, stationId, { ...session, buffet }) })
      },

      checkout: (stationId, endedAt) => {
        const { stations, sessions, invoices, nextInvoiceNumber } = get()
        const station = stations.find((s) => s.id === stationId)
        const session = sessions[stationId]
        if (!station || !session) return null

        const invoice = buildInvoice({
          id: crypto.randomUUID(),
          number: nextInvoiceNumber,
          station,
          session,
          endedAt,
        })
        set({
          sessions: withSession(sessions, stationId, null),
          invoices: [...invoices, invoice],
          nextInvoiceNumber: nextInvoiceNumber + 1,
        })
        return invoice
      },
    }),
    {
      // Tauri's WebView keeps localStorage in the app data directory, so open
      // sessions survive restarts. Planned: move invoices to SQLite.
      name: 'gameon:floor',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ stations, sessions, invoices, nextInvoiceNumber }) => ({
        stations,
        sessions,
        invoices,
        nextInvoiceNumber,
      }),
    },
  ),
)
