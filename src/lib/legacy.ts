/*
 * First-release data lived in WebView localStorage under `gameon:floor`
 * (zustand persist). On startup the raw string is handed to the backend,
 * which imports it into SQLite exactly once and keeps the payload verbatim.
 *
 * The original key is only removed after the backend confirms the data is
 * safely stored, and a copy is kept under an archive key first. If anything
 * fails, the original stays untouched.
 */

import type { LegacyStatus } from '@/types'

export const LEGACY_KEY = 'gameon:floor'
export const LEGACY_ARCHIVE_PREFIX = 'gameon:floor:archived:'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function storage(): StorageLike | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readLegacyPayload(store: StorageLike | null = storage()): string | null {
  try {
    return store?.getItem(LEGACY_KEY) ?? null
  } catch {
    return null
  }
}

/** Statuses after which the payload is safely held in SQLite. */
const SAFE_IN_DATABASE: readonly LegacyStatus[] = ['imported', 'already_imported', 'skipped']

/**
 * Archive the legacy key once the database holds it. Returns true when the
 * original key was removed.
 */
export function archiveLegacyPayload(
  payload: string,
  status: LegacyStatus,
  hash: string | null,
  store: StorageLike | null = storage(),
): boolean {
  if (!store || !hash || !SAFE_IN_DATABASE.includes(status)) return false
  try {
    if (store.getItem(LEGACY_KEY) !== payload) return false // changed meanwhile — leave it
    const archiveKey = `${LEGACY_ARCHIVE_PREFIX}${hash.slice(0, 16)}`
    store.setItem(archiveKey, payload)
    if (store.getItem(archiveKey) !== payload) return false
    store.removeItem(LEGACY_KEY)
    return true
  } catch {
    // Quota or access error: keep the original; the backend dedupes by hash.
    return false
  }
}
