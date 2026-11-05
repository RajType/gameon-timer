import { create } from 'zustand'
import { api } from '@/lib/api'
import { localDayRange } from '@/lib/time'
import type { DaySummary, Floor, Invoice, OrderResult, Session, Station } from '@/types'
import { useSettingsStore } from './settingsStore'
import { toastError } from './uiStore'

interface StationState {
  stations: Station[]
  /** Open sessions keyed by station id. */
  sessions: Record<string, Session>
  daySummary: DaySummary
  /** Start of the local day `daySummary` covers. */
  summaryDay: number
  /** Stations with a command in flight (buttons disabled meanwhile). */
  pending: Record<string, true>
}

interface StationActions {
  setFloor: (floor: Floor) => void
  refreshSummary: (now?: number) => Promise<void>
  // Resolve to `true` on success; failures are shown as a toast.
  startSession: (stationId: string, controllers?: number) => Promise<boolean>
  pauseSession: (stationId: string) => Promise<boolean>
  resumeSession: (stationId: string) => Promise<boolean>
  setControllers: (stationId: string, controllers: number) => Promise<boolean>
  /** Buffet order on the station's open session (stock-checked by the backend). */
  addOrderItem: (stationId: string, productId: string, quantity?: number) => Promise<boolean>
  removeOrderItem: (stationId: string, productId: string) => Promise<boolean>
  /** Optimistic: the card stays where it was dropped; reverted if saving fails. */
  moveStation: (stationId: string, posX: number, posY: number) => Promise<void>
  /** Throws on failure so the checkout dialog can react (e.g. stale total). */
  checkout: (stationId: string, at: number, expectedTotal: number) => Promise<Invoice>
}

export type StationStore = StationState & StationActions

/** Latest position save; older responses must not overwrite a newer drop. */
let moveSequence = 0

/** One checkout per station at a time: a repeat call joins the one in flight. */
const checkoutsInFlight = new Map<string, Promise<Invoice>>()

/** Orders change stock: publish the fresh buffet items, hand back the floor. */
async function withProducts(request: Promise<OrderResult>): Promise<Floor> {
  const result = await request
  useSettingsStore.getState().setProducts(result.products)
  return result.floor
}

function bySession(sessions: Session[]): Record<string, Session> {
  return Object.fromEntries(sessions.map((s) => [s.stationId, s]))
}

/**
 * Floor state mirrored from SQLite. Every mutation goes through a backend
 * command that runs in one transaction and returns the fresh floor.
 */
export const useStationStore = create<StationStore>()((set, get) => {
  async function mutate(
    stationId: string,
    title: string,
    run: (session: Session | undefined) => Promise<Floor>,
  ): Promise<boolean> {
    if (get().pending[stationId]) return false
    set((s) => ({ pending: { ...s.pending, [stationId]: true } }))
    try {
      get().setFloor(await run(get().sessions[stationId]))
      return true
    } catch (error) {
      toastError(title, error)
      return false
    } finally {
      set((s) => {
        const pending = { ...s.pending }
        delete pending[stationId]
        return { pending }
      })
    }
  }

  function sessionId(session: Session | undefined): string {
    if (!session) throw new Error('این ایستگاه جلسه‌ی باز ندارد.')
    return session.id
  }

  return {
    stations: [],
    sessions: {},
    daySummary: { invoiceCount: 0, revenue: 0 },
    summaryDay: 0,
    pending: {},

    setFloor: (floor) => set({ stations: floor.stations, sessions: bySession(floor.sessions) }),

    refreshSummary: async (now = Date.now()) => {
      const [from, to] = localDayRange(now)
      try {
        set({ daySummary: await api.daySummary(from, to), summaryDay: from })
      } catch (error) {
        toastError('خلاصه‌ی امروز بارگذاری نشد', error)
      }
    },

    startSession: (stationId, controllers) =>
      mutate(stationId, 'شروع جلسه ناموفق بود', () => api.startSession(stationId, controllers)),
    pauseSession: (stationId) =>
      mutate(stationId, 'مکث ناموفق بود', (s) => api.pauseSession(sessionId(s))),
    resumeSession: (stationId) =>
      mutate(stationId, 'ادامه‌ی جلسه ناموفق بود', (s) => api.resumeSession(sessionId(s))),
    setControllers: (stationId, controllers) =>
      mutate(stationId, 'تغییر تعداد دسته ناموفق بود', (s) => api.setSessionControllers(sessionId(s), controllers)),
    addOrderItem: (stationId, productId, quantity = 1) =>
      mutate(stationId, 'ثبت سفارش بوفه ناموفق بود', (s) =>
        withProducts(api.addOrderItem(sessionId(s), productId, quantity)),
      ),
    removeOrderItem: (stationId, productId) =>
      mutate(stationId, 'حذف از سفارش ناموفق بود', (s) => withProducts(api.removeOrderItem(sessionId(s), productId))),

    moveStation: async (stationId, posX, posY) => {
      const previous = get().stations.find((s) => s.id === stationId)
      if (!previous) return
      const sequence = ++moveSequence
      const place = (x: number, y: number) =>
        set((s) => ({ stations: s.stations.map((st) => (st.id === stationId ? { ...st, posX: x, posY: y } : st)) }))
      place(posX, posY)
      try {
        const floor = await api.updateStationPosition(stationId, posX, posY)
        if (sequence === moveSequence) get().setFloor(floor)
      } catch (error) {
        place(previous.posX, previous.posY)
        toastError('ذخیره‌ی جای ایستگاه انجام نشد', error)
      }
    },

    checkout: (stationId, at, expectedTotal) => {
      const existing = checkoutsInFlight.get(stationId)
      if (existing) return existing
      const run = (async () => {
        set((s) => ({ pending: { ...s.pending, [stationId]: true } }))
        try {
          const result = await api.checkout(sessionId(get().sessions[stationId]), at, expectedTotal)
          get().setFloor(result.floor)
          void get().refreshSummary()
          return result.invoice
        } finally {
          checkoutsInFlight.delete(stationId)
          set((s) => {
            const pending = { ...s.pending }
            delete pending[stationId]
            return { pending }
          })
        }
      })()
      checkoutsInFlight.set(stationId, run)
      return run
    },
  }
})
