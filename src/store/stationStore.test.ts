// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiMock } from '@/test/mockApi'
import { deferred, invoiceFor, runningSession, stations, T0 } from '@/test/fixtures'
import type { CheckoutResult, Floor } from '@/types'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createApiMock> | null }))
vi.mock('@/lib/api', async (importOriginal) => {
  const { createApiMock: make } = await import('@/test/mockApi')
  mock.current = make()
  return { ...(await importOriginal<typeof import('@/lib/api')>()), api: mock.current.api }
})

const { useStationStore } = await import('./stationStore')
const api = () => mock.current!

beforeEach(() => {
  api().reset()
  useStationStore.setState({ stations: stations(), sessions: { 'station-1': runningSession() }, pending: {} })
})

describe('double submission', () => {
  it('a double start reaches the backend once; pending clears afterwards', async () => {
    const reply = deferred<Floor>()
    api().api.startSession!.mockReturnValueOnce(reply.promise)
    const store = useStationStore.getState()
    const first = store.startSession('station-2')
    const second = store.startSession('station-2')
    expect(api().calls.startSession).toHaveBeenCalledTimes(1)
    expect(useStationStore.getState().pending['station-2']).toBe(true)
    reply.resolve({ stations: stations(), sessions: [runningSession(), runningSession('station-2', T0)] })
    await Promise.all([first, second])
    expect(useStationStore.getState().pending['station-2']).toBeUndefined()
    expect(useStationStore.getState().sessions['station-2']).toBeDefined()
  })

  it('a failed start clears pending so the operator can retry', async () => {
    api().api.startSession!.mockRejectedValueOnce(new Error('boom'))
    await useStationStore.getState().startSession('station-2')
    expect(useStationStore.getState().pending['station-2']).toBeUndefined()
  })

  it('concurrent checkouts join one request and get the same invoice', async () => {
    const session = runningSession()
    const invoice = invoiceFor(session, T0, 75_000)
    const reply = deferred<CheckoutResult>()
    api().api.checkout!.mockReturnValueOnce(reply.promise)
    api().api.daySummary!.mockResolvedValue({ invoiceCount: 1, revenue: 75_000 })

    const store = useStationStore.getState()
    const a = store.checkout('station-1', T0, 75_000)
    const b = store.checkout('station-1', T0, 75_000)
    expect(api().calls.checkout).toHaveBeenCalledTimes(1)
    expect(api().calls.checkout).toHaveBeenCalledWith(session.id, T0, 75_000)
    expect(useStationStore.getState().pending['station-1']).toBe(true) // card buttons disabled meanwhile

    reply.resolve({ invoice, floor: { stations: stations(), sessions: [] } })
    expect(await a).toBe(invoice)
    expect(await b).toBe(invoice)
    expect(useStationStore.getState().pending['station-1']).toBeUndefined()
    expect(useStationStore.getState().sessions['station-1']).toBeUndefined()
  })

  it('a failed checkout rejects, clears pending and allows a fresh attempt', async () => {
    api().api.checkout!.mockRejectedValueOnce(new Error('stale'))
    await expect(useStationStore.getState().checkout('station-1', T0, 1)).rejects.toThrow('stale')
    expect(useStationStore.getState().pending['station-1']).toBeUndefined()
    api().api.checkout!.mockResolvedValueOnce({ invoice: invoiceFor(runningSession(), T0, 1), floor: { stations: stations(), sessions: [] } })
    await useStationStore.getState().checkout('station-1', T0, 1)
    expect(api().calls.checkout).toHaveBeenCalledTimes(2)
  })
})
