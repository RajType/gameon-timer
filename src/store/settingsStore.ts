import { create } from 'zustand'
import { api, errorMessage } from '@/lib/api'
import { applyBranding } from '@/lib/branding'
import type {
  BuffetCatalog,
  Catalog,
  Category,
  CategoryInput,
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
  categories: Category[]
  /** The saved logo as a `data:` URL (sidebar, receipts); `null` = none / unreadable. */
  logoUrl: string | null
  logoError: string | null
}

interface SettingsActions {
  setCatalog: (catalog: Catalog) => void
  setProducts: (products: Product[]) => void
  setBuffetCatalog: (catalog: BuffetCatalog) => void
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
  createCategory: (input: CategoryInput) => Promise<void>
  updateCategory: (id: number, input: CategoryInput) => Promise<void>
  deleteCategory: (id: number, reassignTo: number | null) => Promise<void>
  assignProductsCategory: (productIds: string[], categoryId: number | null) => Promise<void>
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
    categories: [],
    logoUrl: null,
    logoError: null,

    setCatalog: (catalog) =>
      set({ ratePlans: catalog.ratePlans, products: catalog.products, categories: catalog.categories }),
    setProducts: (products) => set({ products }),
    setBuffetCatalog: (catalog) => set({ products: catalog.products, categories: catalog.categories }),
    setSettings: (settings) => set({ settings }),

    createStation: (input) => applySnapshot(api.createStation(input)),
    updateStation: (id, input) => applySnapshot(api.updateStation(id, input)),
    setStationEnabled: (id, enabled) => applySnapshot(api.setStationEnabled(id, enabled)),
    createRatePlan: (input) => applySnapshot(api.createRatePlan(input)),
    updateRatePlan: (id, input) => applySnapshot(api.updateRatePlan(id, input)),
    saveSettings: async (input) => set({ settings: await api.updateSettings(input) }),
    createProduct: async (input) => get().setBuffetCatalog(await api.createProduct(input)),
    updateProduct: async (id, input) => get().setBuffetCatalog(await api.updateProduct(id, input)),
    createCategory: async (input) => get().setBuffetCatalog(await api.createCategory(input)),
    updateCategory: async (id, input) => get().setBuffetCatalog(await api.updateCategory(id, input)),
    deleteCategory: async (id, reassignTo) => get().setBuffetCatalog(await api.deleteCategory(id, reassignTo)),
    assignProductsCategory: async (ids, categoryId) =>
      get().setBuffetCatalog(await api.assignProductsCategory(ids, categoryId)),
  }
})

/** The active rounding rule (CLAUDE.md default: nearest 1,000). */
export function useRoundingRule(): RoundingRule {
  const unit = useSettingsStore((s) => s.settings?.roundingUnit ?? DEFAULT_ROUNDING.unit)
  const mode = useSettingsStore((s) => s.settings?.roundingMode ?? DEFAULT_ROUNDING.mode)
  return { unit, mode }
}

/*
 * Branding follows the saved settings wherever they come from (startup,
 * save, restore): one subscription instead of calls scattered around the app.
 */
let logoRequest = 0
async function refreshLogo(path: string) {
  const request = ++logoRequest
  if (!path) {
    useSettingsStore.setState({ logoUrl: null, logoError: null })
    return
  }
  try {
    const url = await api.readLogo(path)
    if (request === logoRequest) useSettingsStore.setState({ logoUrl: url ?? null, logoError: null })
  } catch (error) {
    // A moved or deleted file must not break anything: fall back to the icon.
    if (request === logoRequest) useSettingsStore.setState({ logoUrl: null, logoError: errorMessage(error) })
  }
}

useSettingsStore.subscribe((state, previous) => {
  const color = state.settings?.brandColor
  if (color && color !== previous.settings?.brandColor) applyBranding(color, { persist: true })
  const logo = state.settings?.logoPath ?? ''
  if (logo !== (previous.settings?.logoPath ?? '')) void refreshLogo(logo)
})
