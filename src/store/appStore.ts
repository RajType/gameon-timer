import { create } from 'zustand'
import { api, errorMessage, isTauri } from '@/lib/api'
import { formatNumber } from '@/lib/currency'
import { archiveLegacyPayload, readLegacyPayload } from '@/lib/legacy'
import type { Bootstrap, LegacyOutcome } from '@/types'
import { useSettingsStore } from './settingsStore'
import { useStationStore } from './stationStore'
import { useUiStore } from './uiStore'

export type Phase = 'loading' | 'ready' | 'legacy-failed' | 'error'

interface AppStore {
  phase: Phase
  error: string | null
  legacy: LegacyOutcome | null
  /** Kept only while the operator decides what to do after a failed import. */
  legacyPayload: string | null
  bootstrap: () => Promise<void>
  /** @internal use `bootstrap` */
  runBootstrap: () => Promise<void>
  continueWithoutLegacy: () => Promise<void>
  applyBootstrap: (boot: Bootstrap) => void
}

let inflight: Promise<void> | null = null

export const useAppStore = create<AppStore>()((set, get) => ({
  phase: 'loading',
  error: null,
  legacy: null,
  legacyPayload: null,

  applyBootstrap: (boot) => {
    useStationStore.getState().setFloor(boot.floor)
    useSettingsStore.getState().setCatalog(boot.catalog)
    useSettingsStore.getState().setSettings(boot.settings)
    void useStationStore.getState().refreshSummary()
  },

  // Single-flight: StrictMode (dev) mounts effects twice.
  bootstrap: () => {
    inflight ??= get()
      .runBootstrap()
      .finally(() => {
        inflight = null
      })
    return inflight
  },

  runBootstrap: async () => {
    set({ phase: 'loading', error: null })
    if (!isTauri()) {
      set({ phase: 'error', error: 'این برنامه باید در نسخه‌ی دسکتاپ (Tauri) اجرا شود؛ داده‌ها در پایگاه داده‌ی محلی آن نگهداری می‌شوند.' })
      return
    }
    try {
      const payload = readLegacyPayload()
      const boot = await api.bootstrap(payload)
      if (boot.legacy.status === 'failed') {
        // Leave localStorage untouched; ask the operator.
        set({ phase: 'legacy-failed', legacy: boot.legacy, legacyPayload: payload })
        return
      }
      if (payload) archiveLegacyPayload(payload, boot.legacy.status, boot.legacy.hash)
      get().applyBootstrap(boot)
      set({ phase: 'ready', legacy: boot.legacy, legacyPayload: null })

      const summary = boot.legacy.summary
      if (boot.legacy.status === 'imported' && summary) {
        useUiStore.getState().pushToast({
          tone: 'success',
          title: 'داده‌های نسخه‌ی قبلی منتقل شد',
          detail: `${formatNumber(summary.stations)} ایستگاه، ${formatNumber(summary.openSessions)} جلسه‌ی باز، ${formatNumber(summary.invoices)} فاکتور`,
        })
      }
    } catch (error) {
      set({ phase: 'error', error: errorMessage(error) })
    }
  },

  continueWithoutLegacy: async () => {
    const payload = get().legacyPayload
    if (!payload) return
    try {
      const boot = await api.skipLegacyImport(payload)
      // The payload is now stored in SQLite; keep a localStorage copy too.
      archiveLegacyPayload(payload, boot.legacy.status, boot.legacy.hash)
      get().applyBootstrap(boot)
      set({ phase: 'ready', legacy: boot.legacy, legacyPayload: null })
    } catch (error) {
      set({ phase: 'error', error: errorMessage(error) })
    }
  },
}))
