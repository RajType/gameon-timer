// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiMock } from '@/test/mockApi'
import { categories, products, ratePlans, runningSession, settings, stations } from '@/test/fixtures'
import { installResizeObserver } from '@/test/resizeObserver'
import type { Bootstrap } from '@/types'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createApiMock> | null }))
vi.mock('@/lib/api', async (importOriginal) => {
  const { createApiMock: make } = await import('@/test/mockApi')
  mock.current = make()
  return { ...(await importOriginal<typeof import('@/lib/api')>()), api: mock.current.api }
})

const { default: App } = await import('./App')
const { useUiStore } = await import('@/store/uiStore')

const boot: Bootstrap = {
  initialized: true,
  floor: { stations: stations(), sessions: [runningSession()] },
  catalog: { ratePlans, products, categories },
  settings,
  legacy: { status: 'none', hash: null, summary: null, error: null },
}

beforeEach(() => {
  mock.current!.reset()
  mock.current!.api.bootstrap!.mockResolvedValue(boot)
  mock.current!.api.daySummary!.mockResolvedValue({ invoiceCount: 0, revenue: 0 })
  installResizeObserver(1200)
  vi.stubGlobal('__TAURI_INTERNALS__', {}) // isTauri() → true
  useUiStore.setState({ view: 'dashboard', layoutEditing: false, checkout: null, toasts: [] })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('dynamic branding at startup', () => {
  it('applies the stored brand colour and shows the store name and logo', async () => {
    mock.current!.api.bootstrap!.mockResolvedValue({
      ...boot,
      settings: { ...settings, brandColor: '#0a84ff', storeName: 'گیم‌نت آریا', logoPath: '/srv/logo.png' },
    })
    mock.current!.api.readLogo!.mockResolvedValue('data:image/png;base64,AAAA')
    render(<App />)
    await waitFor(() => expect(document.documentElement.style.getPropertyValue('--brand-color')).toBe('#0a84ff'))
    expect(document.documentElement.style.getPropertyValue('--brand-contrast')).toBe('#000000')
    expect(await screen.findByText('گیم‌نت آریا')).toBeTruthy()
    await waitFor(() => expect(mock.current!.calls.readLogo).toHaveBeenCalledWith('/srv/logo.png'))
    await waitFor(() =>
      expect(document.querySelector('aside img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA'),
    )
  })
})

describe('app shell navigation', () => {
  it('sidebar «نقشه‌ی سالن» is enabled and renders the live, read-only floor map', async () => {
    render(<App />)
    const item = await screen.findByRole('button', { name: /نقشه‌ی سالن/ })
    expect(item).toHaveProperty('disabled', false)
    expect(item.textContent).not.toContain('به‌زودی')

    fireEvent.click(item)

    const map = await screen.findByRole('region', { name: 'نقشه‌ی زنده‌ی سالن' })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('نقشه‌ی سالن')
    expect(item.getAttribute('aria-current')).toBe('page')
    expect(map.querySelectorAll('[data-station-id]')).toHaveLength(stations().length)
    expect(map.querySelector('[aria-roledescription]')).toBeNull() // live mode: no drag handles
    expect(map.querySelector('[inert]')).toBeNull() // cards interactive
    expect(useUiStore.getState().view).toBe('floor')
  })

  it('sidebar «بوفه» is enabled and renders the buffet list', async () => {
    render(<App />)
    const item = await screen.findByRole('button', { name: /^بوفه/ })
    expect(item).toHaveProperty('disabled', false)
    fireEvent.click(item)
    expect(await screen.findByRole('button', { name: /کالای جدید/ })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('بوفه')
    expect(document.querySelectorAll('[data-product-id]')).toHaveLength(products.length)
    expect(useUiStore.getState().view).toBe('buffet')
  })
})
