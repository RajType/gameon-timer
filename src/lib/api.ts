import { invoke } from '@tauri-apps/api/core'
import type {
  Bootstrap,
  Catalog,
  CheckoutResult,
  DataInfo,
  DaySummary,
  Floor,
  Invoice,
  RatePlanInput,
  RestoreResult,
  Settings,
  Snapshot,
  StationInput,
} from '@/types'

/** Error shape produced by `src-tauri/src/error.rs`. */
export class ApiError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      const { code, message } = error as { code?: unknown; message?: unknown }
      throw new ApiError(typeof code === 'string' ? code : 'unknown', String(message))
    }
    throw new ApiError('unknown', String(error))
  }
}

/** Typed wrappers for every backend command (`src-tauri/src/commands.rs`). */
export const api = {
  bootstrap: (legacyPayload: string | null) => call<Bootstrap>('bootstrap', { legacyPayload }),
  skipLegacyImport: (legacyPayload: string) => call<Bootstrap>('skip_legacy_import', { legacyPayload }),

  getFloor: () => call<Floor>('get_floor'),
  startSession: (stationId: string, controllers?: number) =>
    call<Floor>('start_session', { stationId, controllers: controllers ?? null }),
  pauseSession: (sessionId: string) => call<Floor>('pause_session', { sessionId }),
  resumeSession: (sessionId: string) => call<Floor>('resume_session', { sessionId }),
  setSessionControllers: (sessionId: string, controllers: number) =>
    call<Floor>('set_session_controllers', { sessionId, controllers }),
  addOrderItem: (sessionId: string, productId: string) => call<Floor>('add_order_item', { sessionId, productId }),
  removeOrderItem: (sessionId: string, productId: string) =>
    call<Floor>('remove_order_item', { sessionId, productId }),
  previewCheckout: (sessionId: string, at: number) => call<Invoice>('preview_checkout', { sessionId, at }),
  checkout: (sessionId: string, at: number, expectedTotal: number) =>
    call<CheckoutResult>('checkout', { sessionId, at, expectedTotal }),
  daySummary: (from: number, to: number) => call<DaySummary>('day_summary', { from, to }),

  getCatalog: () => call<Catalog>('get_catalog'),
  createStation: (input: StationInput) => call<Snapshot>('create_station', { input }),
  updateStation: (id: string, input: StationInput) => call<Snapshot>('update_station', { id, input }),
  setStationEnabled: (id: string, enabled: boolean) => call<Snapshot>('set_station_enabled', { id, enabled }),
  createRatePlan: (input: RatePlanInput) => call<Snapshot>('create_rate_plan', { input }),
  updateRatePlan: (id: string, input: RatePlanInput) => call<Snapshot>('update_rate_plan', { id, input }),
  getSettings: () => call<Settings>('get_settings'),
  updateSettings: (input: Settings) => call<Settings>('update_settings', { input }),

  dataInfo: () => call<DataInfo>('data_info'),
  createBackup: () => call<DataInfo>('create_backup'),
  exportBackup: () => call<string | null>('export_backup'),
  restoreBackup: (fileName: string) => call<RestoreResult>('restore_backup', { fileName }),
  restoreBackupFromFile: () => call<RestoreResult | null>('restore_backup_from_file'),
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
