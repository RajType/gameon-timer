import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type View = 'dashboard' | 'floor' | 'stations' | 'rates' | 'settings' | 'data'
export type StationFilter = 'all' | 'running' | 'paused' | 'available'

export interface CheckoutTarget {
  stationId: string
  /** The moment the operator pressed "checkout" — billing is frozen here. */
  at: number
}

export type ToastTone = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: number
  tone: ToastTone
  title: string
  detail?: string
}

interface UiStore {
  view: View
  setView: (view: View) => void

  stationFilter: StationFilter
  setStationFilter: (filter: StationFilter) => void

  /** Stations page shows the layout editor (not persisted). */
  layoutEditing: boolean
  setLayoutEditing: (editing: boolean) => void

  checkout: CheckoutTarget | null
  openCheckout: (stationId: string) => void
  closeCheckout: () => void

  toasts: Toast[]
  pushToast: (toast: Omit<Toast, 'id'>) => number
  dismissToast: (id: number) => void
}

let nextToastId = 1

/**
 * UI state. Only view preferences are persisted (zustand `persist`); all
 * operational data lives in SQLite.
 */
export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      view: 'dashboard',
      setView: (view) => set({ view }),

      stationFilter: 'all',
      setStationFilter: (stationFilter) => set({ stationFilter }),

      layoutEditing: false,
      setLayoutEditing: (layoutEditing) => set({ layoutEditing }),

      checkout: null,
      openCheckout: (stationId) => set({ checkout: { stationId, at: Date.now() } }),
      closeCheckout: () => set({ checkout: null }),

      toasts: [],
      pushToast: (toast) => {
        const id = nextToastId++
        set((s) => ({ toasts: [...s.toasts.slice(-3), { ...toast, id }] }))
        return id
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: 'gameon:ui',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ view, stationFilter }) => ({ view, stationFilter }),
    },
  ),
)

export function toastError(title: string, error: unknown) {
  useUiStore.getState().pushToast({
    tone: 'error',
    title,
    detail: error instanceof Error ? error.message : String(error),
  })
}
