// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSessionCharges } from '@/lib/billing'
import { formatToman } from '@/lib/currency'
import { defaultSlot } from '@/lib/station'
import { formatDuration } from '@/lib/time'
import { createApiMock } from '@/test/mockApi'
import { deferred, invoiceFor, MIN, products, ratePlans, runningSession, settings, stations, T0 } from '@/test/fixtures'
import { installResizeObserver } from '@/test/resizeObserver'
import type { CheckoutResult, Floor } from '@/types'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createApiMock> | null }))
vi.mock('@/lib/api', async (importOriginal) => {
  const { createApiMock: make } = await import('@/test/mockApi')
  mock.current = make()
  return { ...(await importOriginal<typeof import('@/lib/api')>()), api: mock.current.api }
})

const { FloorPage } = await import('./FloorPage')
const { InvoiceModal } = await import('@/components/InvoiceModal')
const { Sidebar } = await import('@/components/Sidebar')
const { useStationStore } = await import('@/store/stationStore')
const { useSettingsStore } = await import('@/store/settingsStore')
const { useUiStore } = await import('@/store/uiStore')

const api = () => mock.current!
const WIDTH = 1200
const RULE = { unit: settings.roundingUnit, mode: settings.roundingMode }
let viewport: ReturnType<typeof installResizeObserver>

const cardOf = (id: string) => {
  const el = document.querySelector<HTMLElement>(`[data-station-id="${id}"]`)
  if (!el) throw new Error(`no card ${id}`)
  return el
}
const px = (el: HTMLElement) => [el.style.left, el.style.top]

beforeEach(() => {
  api().reset()
  viewport = installResizeObserver(WIDTH)
  useStationStore.setState({ stations: stations(), sessions: { 'station-1': runningSession() }, pending: {} })
  useSettingsStore.setState({ settings, ratePlans, products })
  useUiStore.setState({ view: 'floor', checkout: null, toasts: [], layoutEditing: false })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('live floor map', () => {
  it('places every station at its saved position; unplaced ones in the default grid', () => {
    render(<FloorPage />)
    expect(px(cardOf('station-1'))).toEqual(['40px', '360px'])
    expect(px(cardOf('station-2'))).toEqual(['880px', '360px'])
    const slot = defaultSlot(2, WIDTH)
    expect(px(cardOf('station-3'))).toEqual([`${slot.x}px`, `${slot.y}px`])
    expect(px(cardOf('station-4'))).toEqual(['600px', '700px'])
  })

  it('is read-only: no drag affordances, pointer gestures move nothing, cards stay interactive', () => {
    render(<FloorPage />)
    const map = screen.getByRole('region', { name: 'نقشه‌ی زنده‌ی سالن' })
    expect(map.querySelector('[aria-roledescription]')).toBeNull()
    expect(map.querySelector('[inert]')).toBeNull()
    const card = cardOf('station-2')
    fireEvent.pointerDown(card, { clientX: 10, clientY: 10, button: 0 })
    fireEvent.pointerMove(card, { clientX: 200, clientY: 120 })
    fireEvent.pointerUp(card, { clientX: 200, clientY: 120 })
    expect(px(card)).toEqual(['880px', '360px'])
    expect(api().used()).toEqual([])
    expect(within(card).getByRole('button', { name: /شروع جلسه/ })).toHaveProperty('disabled', false)
  })

  it('physical board left-to-right, cards right-to-left', () => {
    render(<FloorPage />)
    expect(screen.getByRole('region', { name: 'نقشه‌ی زنده‌ی سالن' }).getAttribute('dir')).toBe('ltr')
    for (const id of ['station-1', 'station-2', 'station-3', 'station-4']) expect(cardOf(id).getAttribute('dir')).toBe('rtl')
  })

  it('shows status: green for running, subtle gray for available, legend counts', () => {
    render(<FloorPage />)
    const running = cardOf('station-1').querySelector('article')!
    const idle = cardOf('station-2').querySelector('article')!
    expect(running.className).toContain('border-status-running')
    expect(within(running).getByText('در حال بازی').closest('span')!.className).toContain('text-status-running')
    expect(idle.className).toContain('border-separator')
    expect(within(idle).getByText('آزاد').closest('span')!.className).toContain('text-label-secondary')
    const legend = screen.getByRole('list', { name: 'راهنمای وضعیت' })
    expect(legend.textContent).toContain('در حال بازی۱')
    expect(legend.textContent).toContain('آزاد۲')
  })

  it('ticks live with the dashboard formulas and never calls the backend on a tick', async () => {
    vi.useFakeTimers({ now: T0 })
    const session = runningSession()
    render(<FloorPage />)
    const card = cardOf('station-1')
    expect(card.textContent).toContain(formatDuration(30 * MIN))
    expect(card.textContent).toContain(formatToman(getSessionCharges(session, RULE, T0).total))

    await act(async () => {
      vi.advanceTimersByTime(65_500)
    })
    const at = T0 + 65_005 // ticks land 5 ms after each wall-clock second
    expect(card.textContent).toContain(formatDuration(at - session.startedAt))
    expect(card.textContent).toContain(formatToman(getSessionCharges(session, RULE, at).total))
    expect(api().used()).toEqual([]) // no SQLite writes (or reads) on ticks
  })

  it('starts a session from the map once, even on a double click', async () => {
    const reply = deferred<Floor>()
    api().api.startSession!.mockReturnValueOnce(reply.promise)
    render(<FloorPage />)
    const start = within(cardOf('station-2')).getByRole('button', { name: /شروع جلسه/ })
    fireEvent.click(start)
    fireEvent.click(start)
    expect(api().calls.startSession).toHaveBeenCalledTimes(1)
    expect(api().calls.startSession).toHaveBeenCalledWith('station-2', undefined)
    expect(start).toHaveProperty('disabled', true)
    await act(async () => reply.resolve({ stations: stations(), sessions: [runningSession(), runningSession('station-2', Date.now())] }))
    expect(cardOf('station-2').textContent).toContain('در حال بازی')
  })

  it('checks out through the shared invoice dialog and submits once', async () => {
    const session = runningSession()
    api().api.previewCheckout!.mockImplementation(async (_id: string, at: number) => invoiceFor(session, at, 75_000))
    api().api.daySummary!.mockResolvedValue({ invoiceCount: 1, revenue: 75_000 })
    const reply = deferred<CheckoutResult>()
    api().api.checkout!.mockReturnValueOnce(reply.promise)

    render(
      <>
        <FloorPage />
        <InvoiceModal />
      </>,
    )
    fireEvent.click(within(cardOf('station-1')).getByRole('button', { name: /تسویه/ }))
    const at = useUiStore.getState().checkout!.at
    const confirm = await screen.findByRole('button', { name: /پرداخت و بستن جلسه/ })
    await waitFor(() => expect(confirm).toHaveProperty('disabled', false))
    expect(api().calls.previewCheckout).toHaveBeenCalledWith(session.id, at)

    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(api().calls.checkout).toHaveBeenCalledTimes(1)
    expect(api().calls.checkout).toHaveBeenCalledWith(session.id, at, 75_000)

    await act(async () => reply.resolve({ invoice: invoiceFor(session, at, 75_000), floor: { stations: stations(), sessions: [] } }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(cardOf('station-1').textContent).toContain('آزاد')
  })

  it('Tab follows the visual right-to-left reading order, and Enter starts a session', async () => {
    api().api.startSession!.mockResolvedValue({ stations: stations(), sessions: [runningSession()] })
    const user = userEvent.setup()
    render(<FloorPage />)
    const visited: string[] = []
    for (let i = 0; i < 12; i++) {
      await user.tab()
      const id = document.activeElement?.closest('[data-station-id]')?.getAttribute('data-station-id')
      if (id && visited.at(-1) !== id) visited.push(id)
    }
    // Top row: station 3 (default slot). Second row, right to left: 2 then 1.
    // Station 4 is disabled and has nothing to focus.
    expect(visited.slice(0, 3)).toEqual(['station-3', 'station-2', 'station-1'])

    within(cardOf('station-3')).getByRole('button', { name: /شروع جلسه/ }).focus()
    await user.keyboard('{Enter}')
    expect(api().calls.startSession).toHaveBeenCalledWith('station-3', undefined)
  })

  it('fits wide layouts to a smaller window and keeps saved coordinates', () => {
    render(<FloorPage />)
    const board = screen.getByTestId('floor-board')
    expect(board.dataset.scale).toBe('1')

    act(() => viewport.resize(1000)) // content is 880 + 280 + 16 = 1176 wide
    expect(board.dataset.scale).toBe('0.85')
    expect(board.style.transform).toBe('scale(0.85)')
    expect(px(cardOf('station-2'))).toEqual(['880px', '360px'])
    const slot = defaultSlot(2, 1000) // unplaced stations reflow with the window
    expect(px(cardOf('station-3'))).toEqual([`${slot.x}px`, `${slot.y}px`])

    act(() => viewport.resize(500)) // too small to stay legible: floor scale, then scroll
    expect(board.dataset.scale).toBe('0.7')
    expect(parseFloat((board.parentElement as HTMLElement).style.width)).toBeGreaterThan(500)

    act(() => viewport.resize(1600))
    expect(board.dataset.scale).toBe('1')
    expect(api().used()).toEqual([]) // resizing never persists anything
  })

  it('"ویرایش چیدمان" opens the Stations page in layout-edit mode', () => {
    render(<FloorPage />)
    fireEvent.click(screen.getByRole('button', { name: /ویرایش چیدمان/ }))
    expect(useUiStore.getState().view).toBe('stations')
    expect(useUiStore.getState().layoutEditing).toBe(true)
  })
})

describe('sidebar', () => {
  it('«نقشه‌ی سالن» is enabled and opens the live map', () => {
    useUiStore.setState({ view: 'dashboard' })
    render(<Sidebar />)
    const item = screen.getByRole('button', { name: /نقشه‌ی سالن/ })
    expect(item).toHaveProperty('disabled', false)
    fireEvent.click(item)
    expect(useUiStore.getState().view).toBe('floor')
    expect(item.getAttribute('aria-current')).toBe('page')
  })
})
