// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { createApiMock } from '@/test/mockApi'
import { categories, deferred, invoiceFor, products, ratePlans, runningSession, settings, stations, T0 } from '@/test/fixtures'
import { installResizeObserver } from '@/test/resizeObserver'
import type { Invoice, OrderResult, Product } from '@/types'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createApiMock> | null }))
vi.mock('@/lib/api', async (importOriginal) => {
  const { createApiMock: make } = await import('@/test/mockApi')
  mock.current = make()
  return { ...(await importOriginal<typeof import('@/lib/api')>()), api: mock.current.api }
})

const { BuffetPage } = await import('./BuffetPage')
const { BuffetOrderModal } = await import('@/components/buffet/BuffetOrderModal')
const { StationCard } = await import('@/components/StationCard')
const { InvoiceModal } = await import('@/components/InvoiceModal')
const { useStationStore } = await import('@/store/stationStore')
const { useSettingsStore } = await import('@/store/settingsStore')
const { useUiStore } = await import('@/store/uiStore')

const api = () => mock.current!
const row = (id: string) => document.querySelector<HTMLElement>(`[data-product-id="${id}"]`)!
const withStock = (id: string, stockQuantity: number | null): Product[] =>
  products.map((p) => (p.id === id ? { ...p, stockQuantity } : p))

beforeEach(() => {
  api().reset()
  installResizeObserver(1200)
  useStationStore.setState({ stations: stations(), sessions: { 'station-1': runningSession() }, pending: {} })
  useSettingsStore.setState({ settings, ratePlans, products, categories })
  useUiStore.setState({ checkout: null, toasts: [] })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('buffet page', () => {
  it('lists items with category, price and stock; flags sold-out and low stock', () => {
    render(<BuffetPage />)
    expect(row('soda').textContent).toContain('نوشیدنی')
    expect(row('soda').textContent).toContain('۲۵٬۰۰۰ تومان')
    expect(row('soda').textContent).toContain('۳ عدد')
    expect(row('coffee').textContent).toContain('بدون شمارش')
    expect(row('cake').textContent).toContain('ناموجود')
    expect(row('old').textContent).toContain('غیرفعال')
    expect(document.body.textContent).toContain('۱ کالا ناموجود، ۱ کالا رو به اتمام')
  })

  it('ordering needs an available item and an active session', () => {
    render(<BuffetPage />)
    const order = (id: string) => within(row(id)).getByRole('button', { name: /سفارش/ })
    expect(order('soda')).toHaveProperty('disabled', false)
    expect(order('coffee')).toHaveProperty('disabled', false)
    expect(order('cake')).toHaveProperty('disabled', true) // sold out
    expect(order('old')).toHaveProperty('disabled', true) // inactive
    cleanup()

    useStationStore.setState({ sessions: {} })
    render(<BuffetPage />)
    expect(screen.getByRole('status').textContent).toContain('هیچ جلسه‌ی فعالی نیست')
    expect(order('soda')).toHaveProperty('disabled', true)
  })

  it('orders onto an open session, capped by stock, submitted once', async () => {
    const reply = deferred<OrderResult>()
    api().api.addOrderItem!.mockReturnValueOnce(reply.promise)
    render(<BuffetPage />)
    fireEvent.click(within(row('soda')).getByRole('button', { name: /سفارش/ }))
    const dialog = await screen.findByRole('dialog')

    // Only stations with an open session are offered.
    const options = within(dialog).getAllByRole('option').map((o) => o.getAttribute('value'))
    expect(options).toEqual(['station-1'])

    const plus = within(dialog).getByRole('button', { name: 'افزودن تعداد' })
    for (let i = 0; i < 5; i++) fireEvent.click(plus)
    expect(within(dialog).getByRole('status').textContent).toBe('۳') // stock is 3
    expect(plus).toHaveProperty('disabled', true)
    expect(within(dialog).getByTestId('order-total').textContent).toBe('۷۵٬۰۰۰ تومان')

    const confirm = within(dialog).getByRole('button', { name: 'ثبت سفارش' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(api().calls.addOrderItem).toHaveBeenCalledTimes(1)
    expect(api().calls.addOrderItem).toHaveBeenCalledWith(runningSession().id, 'soda', 3)

    await act(async () =>
      reply.resolve({ floor: { stations: stations(), sessions: [runningSession()] }, products: withStock('soda', 0) }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(row('soda').textContent).toContain('ناموجود') // stock refreshed from the order response
    expect(useUiStore.getState().toasts.at(-1)?.title).toBe('سفارش بوفه ثبت شد')
  })

  it('keeps the dialog open when the backend rejects the order', async () => {
    api().api.addOrderItem!.mockRejectedValueOnce(new ApiError('conflict', 'موجودی «نوشابه» تمام شده است.'))
    render(<BuffetPage />)
    fireEvent.click(within(row('soda')).getByRole('button', { name: /سفارش/ }))
    const confirm = await screen.findByRole('button', { name: 'ثبت سفارش' })
    fireEvent.click(confirm)
    await waitFor(() => expect(useUiStore.getState().toasts.at(-1)?.detail).toContain('تمام شده'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(confirm).toHaveProperty('disabled', false) // can retry
  })

  it('refuses to order without an active session (session closed while the dialog was open)', () => {
    useStationStore.setState({ sessions: {} })
    render(<BuffetOrderModal product={products[0]!} onClose={() => {}} />)
    expect(screen.getByRole('alert').textContent).toContain('فقط روی جلسه‌ی باز')
    expect(screen.getByRole('button', { name: 'ثبت سفارش' })).toHaveProperty('disabled', true)
  })
})

describe('categories on the buffet page', () => {
  const chips = () => screen.getByRole('radiogroup', { name: 'فیلتر دسته' })
  const shown = () => [...document.querySelectorAll('[data-product-id]')].map((r) => r.getAttribute('data-product-id'))

  it('filters by category, with an uncategorised view for items without one', () => {
    render(<BuffetPage />)
    expect(shown()).toEqual(['soda', 'coffee', 'cake', 'old'])
    expect(chips().textContent).toContain('همه۴')
    expect(chips().textContent).toContain('بدون دسته۱')
    fireEvent.click(within(chips()).getByRole('radio', { name: /نوشیدنی/ }))
    expect(shown()).toEqual(['soda', 'coffee'])
    fireEvent.click(within(chips()).getByRole('radio', { name: /بدون دسته/ }))
    expect(shown()).toEqual(['old'])
    expect(row('old').textContent).toContain('بدون دسته')
  })

  it('falls back to all items when the filtered category disappears', () => {
    render(<BuffetPage />)
    fireEvent.click(within(chips()).getByRole('radio', { name: /تنقلات/ }))
    expect(shown()).toEqual(['cake'])
    act(() => useSettingsStore.setState({ categories: categories.filter((c) => c.id !== 2) }))
    expect(shown()).toHaveLength(4)
  })

  it('re-categorises selected items in one request', async () => {
    const moved = products.map((p) => (p.id === 'soda' || p.id === 'old' ? { ...p, categoryId: 2 } : p))
    api().api.assignProductsCategory!.mockResolvedValue({ products: moved, categories })
    render(<BuffetPage />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'انتخاب نوشابه' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'انتخاب کالای قدیمی' }))
    const bar = screen.getByRole('toolbar', { name: /تغییر دسته/ })
    expect(bar.textContent).toContain('۲ کالا انتخاب شده')
    fireEvent.change(within(bar).getByLabelText('انتقال به'), { target: { value: '2' } })
    fireEvent.click(within(bar).getByRole('button', { name: /اعمال/ }))
    await waitFor(() => expect(api().calls.assignProductsCategory).toHaveBeenCalledTimes(1))
    expect(api().calls.assignProductsCategory).toHaveBeenCalledWith(['soda', 'old'], 2)
    await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull()) // selection cleared
    expect(row('old').textContent).toContain('تنقلات')
  })

  it('a new item defaults to the active category filter', async () => {
    api().api.createProduct!.mockResolvedValue({ products, categories })
    render(<BuffetPage />)
    fireEvent.click(within(chips()).getByRole('radio', { name: /تنقلات/ }))
    fireEvent.click(screen.getByRole('button', { name: /کالای جدید/ }))
    const dialog = await screen.findByRole('dialog')
    expect((within(dialog).getByLabelText('دسته') as HTMLSelectElement).value).toBe('2')
  })
})

describe('product form', () => {
  it('validates, then creates a counted item (Persian digits accepted)', async () => {
    api().api.createProduct!.mockResolvedValue({ products: [...products], categories })
    render(<BuffetPage />)
    fireEvent.click(screen.getByRole('button', { name: /کالای جدید/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'افزودن کالا' }))
    expect(within(dialog).getByRole('alert').textContent).toContain('نام کالا')
    expect(api().used()).toEqual([])

    fireEvent.change(within(dialog).getByLabelText('نام'), { target: { value: 'آبمیوه' } })
    fireEvent.change(within(dialog).getByLabelText('قیمت'), { target: { value: '۳۵۰۰۰' } })
    fireEvent.change(within(dialog).getByLabelText('موجودی فعلی'), { target: { value: '۱۲' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'افزودن کالا' }))
    await waitFor(() => expect(api().calls.createProduct).toHaveBeenCalledTimes(1))
    expect(api().calls.createProduct).toHaveBeenCalledWith({
      name: 'آبمیوه',
      categoryId: null,
      price: 35_000,
      active: true,
      stockQuantity: 12,
    })
  })

  it('edits an item and can stop counting its stock', async () => {
    api().api.updateProduct!.mockResolvedValue({ products: withStock('soda', null), categories })
    render(<BuffetPage />)
    fireEvent.click(within(row('soda')).getByRole('button', { name: /ویرایش/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('switch', { name: 'شمارش موجودی' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'ذخیره' }))
    await waitFor(() => expect(api().calls.updateProduct).toHaveBeenCalledTimes(1))
    expect(api().calls.updateProduct).toHaveBeenCalledWith('soda', expect.objectContaining({ stockQuantity: null, price: 25_000 }))
    await waitFor(() => expect(row('soda').textContent).toContain('بدون شمارش'))
  })
})

describe('station-card buffet popover', () => {
  it('shows stock, hides inactive items, disables sold-out ones and refreshes stock after ordering', async () => {
    api().api.addOrderItem!.mockResolvedValue({ floor: { stations: stations(), sessions: [runningSession()] }, products: withStock('soda', 2) })
    render(<StationCard station={stations()[0]!} />)
    fireEvent.click(screen.getByRole('button', { name: 'افزودن از بوفه' }))
    expect(screen.queryByRole('button', { name: 'افزودن کالای قدیمی' })).toBeNull()
    expect(screen.getByRole('button', { name: 'افزودن کیک' })).toHaveProperty('disabled', true)
    expect(document.body.textContent).toContain('ناموجود')

    fireEvent.click(screen.getByRole('button', { name: 'افزودن نوشابه' }))
    await waitFor(() => expect(api().calls.addOrderItem).toHaveBeenCalledWith(runningSession().id, 'soda', 1))
    await waitFor(() => expect(useSettingsStore.getState().products.find((p) => p.id === 'soda')?.stockQuantity).toBe(2))
  })
})

describe('invoice dialog', () => {
  it('shows buffet orders as line items (quantity × unit price)', async () => {
    const session = runningSession()
    api().api.previewCheckout!.mockImplementation(async (_id: string, at: number): Promise<Invoice> => {
      const base = invoiceFor(session, at, 75_000)
      return {
        ...base,
        ordersTotal: 50_000,
        subtotal: 125_000,
        total: 125_000,
        lines: [
          ...base.lines,
          { kind: 'item', label: 'نوشابه', productId: 'soda', controllers: null, durationMs: null, unitPrice: 25_000, quantity: 2, amount: 50_000 },
        ],
      }
    })
    useUiStore.setState({ checkout: { stationId: 'station-1', at: T0 } })
    render(<InvoiceModal />)
    const items = await screen.findByRole('region', { name: 'اقلام' })
    await waitFor(() => expect(items.textContent).toContain('نوشابه'))
    expect(items.textContent).toContain('۲ × ۲۵٬۰۰۰ تومان')
    expect(items.textContent).toContain('۵۰٬۰۰۰ تومان')
    expect(screen.getByTestId('invoice-total').textContent).toBe('۱۲۵٬۰۰۰ تومان')
  })
})
