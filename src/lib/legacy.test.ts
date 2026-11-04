import { describe, expect, it } from 'vitest'
import { archiveLegacyPayload, LEGACY_ARCHIVE_PREFIX, LEGACY_KEY, readLegacyPayload } from './legacy'

function memoryStorage(initial: Record<string, string> = {}, quota = Infinity) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      const used = [...data.values()].reduce((n, s) => n + s.length, 0)
      if (used + v.length > quota) throw new DOMException('quota', 'QuotaExceededError')
      data.set(k, v)
    },
    removeItem: (k: string) => void data.delete(k),
  }
}

const PAYLOAD = '{"state":{"stations":[]},"version":1}'
const HASH = 'a'.repeat(64)

describe('legacy localStorage hand-off', () => {
  it('reads the zustand key', () => {
    expect(readLegacyPayload(memoryStorage({ [LEGACY_KEY]: PAYLOAD }))).toBe(PAYLOAD)
    expect(readLegacyPayload(memoryStorage())).toBeNull()
  })

  it('archives a copy before removing the original, only once the DB holds it', () => {
    for (const status of ['imported', 'already_imported', 'skipped'] as const) {
      const store = memoryStorage({ [LEGACY_KEY]: PAYLOAD })
      expect(archiveLegacyPayload(PAYLOAD, status, HASH, store)).toBe(true)
      expect(store.getItem(LEGACY_KEY)).toBeNull()
      expect(store.getItem(`${LEGACY_ARCHIVE_PREFIX}${HASH.slice(0, 16)}`)).toBe(PAYLOAD)
    }
  })

  it('never touches the original after a failed import', () => {
    const store = memoryStorage({ [LEGACY_KEY]: PAYLOAD })
    expect(archiveLegacyPayload(PAYLOAD, 'failed', HASH, store)).toBe(false)
    expect(store.getItem(LEGACY_KEY)).toBe(PAYLOAD)
  })

  it('keeps the original when the archive copy cannot be written', () => {
    const store = memoryStorage({ [LEGACY_KEY]: PAYLOAD }, PAYLOAD.length + 10)
    expect(archiveLegacyPayload(PAYLOAD, 'imported', HASH, store)).toBe(false)
    expect(store.getItem(LEGACY_KEY)).toBe(PAYLOAD)
  })

  it('leaves a key that changed since it was read', () => {
    const store = memoryStorage({ [LEGACY_KEY]: 'newer' })
    expect(archiveLegacyPayload(PAYLOAD, 'imported', HASH, store)).toBe(false)
    expect(store.getItem(LEGACY_KEY)).toBe('newer')
  })
})
