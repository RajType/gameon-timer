import { create } from 'zustand'
import { api } from '@/lib/api'
import type {
  Catalog,
  Product,
  ProductInput,
  RatePlan,
  RatePlanInput,
  RoundingRule,
  Settings,
  Snapshot,
  StationInput,
} from '@/types'
import { useStationStore } from './stationStore'

interface SettingsState {
  settings: Settings | null
  ratePlans: RatePlan[]
  products: Product[]
}

interface SettingsActions {
  setCatalog: (catalog: Catalog) => void
  setProducts: (products: Product[]) => void
  setSettings: (settings: Settings) => void
  /** Admin writes throw `ApiError` so forms can show the message inline. */
  createStation: (input: StationInput) => Promise<void>
  updateStation: (id: string, input: StationInput) => Promise<void>
  setStationEnabled: (id: string, enabled: boolean) => Promise<void>
  createRatePlan: (input: RatePlanInput) => Promise<void>
  updateRatePlan: (id: string, input: RatePlanInput) => Promise<void>
  saveSettings: (input: Settings) => Promise<void>
  createProduct: (input: ProductInput) => Promise<void>
  updateProduct: (id: string, input: ProductInput) => Promise<void>
}

export const DEFAULT_ROUNDING: RoundingRule = { unit: 1000, mode: 'nearest' }

export const useSettingsStore = create<SettingsState & SettingsActions>()((set, get) => {
  async function applySnapshot(request: Promise<Snapshot>) {
    const snapshot = await request
    useStationStore.getState().setFloor(snapshot.floor)
    get().setCatalog(snapshot.catalog)
  }

  return {
    settings: null,
    ratePlans: [],
    products: [],

    setCatalog: (catalog) => set({ ratePlans: catalog.ratePlans, products: catalog.products }),
    setProducts: (products) => set({ products }),
    setSettings: (settings) => set({ settings }),

    createStation: (input) => applySnapshot(api.createStation(input)),
    updateStation: (id, input) => applySnapshot(api.updateStation(id, input)),
    setStationEnabled: (id, enabled) => applySnapshot(api.setStationEnabled(id, enabled)),
    createRatePlan: (input) => applySnapshot(api.createRatePlan(input)),
    updateRatePlan: (id, input) => applySnapshot(api.updateRatePlan(id, input)),
    saveSettings: async (input) => set({ settings: await api.updateSettings(input) }),
    createProduct: async (input) => set({ products: await api.createProduct(input) }),
    updateProduct: async (id, input) => set({ products: await api.updateProduct(id, input) }),
  }
})

/** The active rounding rule (CLAUDE.md default: nearest 1,000). */
export function useRoundingRule(): RoundingRule {
  const unit = useSettingsStore((s) => s.settings?.roundingUnit ?? DEFAULT_ROUNDING.unit)
  const mode = useSettingsStore((s) => s.settings?.roundingMode ?? DEFAULT_ROUNDING.mode)
  return { unit, mode }
}
