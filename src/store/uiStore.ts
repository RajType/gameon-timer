import { create } from 'zustand'

export type StationFilter = 'all' | 'running' | 'paused' | 'available'

export interface CheckoutTarget {
  stationId: string
  /** The moment the operator pressed "checkout" — billing is frozen here. */
  at: number
}

interface UiStore {
  stationFilter: StationFilter
  setStationFilter: (filter: StationFilter) => void

  checkout: CheckoutTarget | null
  openCheckout: (stationId: string) => void
  closeCheckout: () => void
}

/** Ephemeral UI state. Intentionally not persisted. */
export const useUiStore = create<UiStore>()((set) => ({
  stationFilter: 'all',
  setStationFilter: (stationFilter) => set({ stationFilter }),

  checkout: null,
  openCheckout: (stationId) => set({ checkout: { stationId, at: Date.now() } }),
  closeCheckout: () => set({ checkout: null }),
}))
