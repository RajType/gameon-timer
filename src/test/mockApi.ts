import { vi, type Mock } from 'vitest'

/**
 * A stand-in for `api` from `@/lib/api`: every command becomes a `vi.fn`
 * on first use, so a test can assert that *no* backend command ran.
 */
export function createApiMock() {
  const calls: Record<string, Mock> = {}
  const api = new Proxy(calls, {
    get: (target, name) => (typeof name === 'string' ? (target[name] ??= vi.fn()) : undefined),
  }) as unknown as Record<string, Mock>
  return {
    api,
    calls,
    /** Names of commands that were actually invoked. */
    used: () => Object.entries(calls).filter(([, fn]) => fn.mock.calls.length > 0).map(([name]) => name),
    reset: () => Object.values(calls).forEach((fn) => fn.mockReset()),
  }
}
