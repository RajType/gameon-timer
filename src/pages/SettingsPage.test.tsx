// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiMock } from '@/test/mockApi'
import { categories, products, ratePlans, settings } from '@/test/fixtures'
import type { BuffetCatalog, Settings } from '@/types'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createApiMock> | null }))
vi.mock('@/lib/api', async (importOriginal) => {
  const { createApiMock: make } = await import('@/test/mockApi')
  mock.current = make()
  return { ...(await importOriginal<typeof import('@/lib/api')>()), api: mock.current.api }
})

const { SettingsPage } = await import('./SettingsPage')
const { useSettingsStore } = await import('@/store/settingsStore')
const { useUiStore } = await import('@/store/uiStore')

const api = () => mock.current!
const brandVar = () => document.documentElement.style.getPropertyValue('--brand-color')
const catalog = (overrides: Partial<BuffetCatalog> = {}): BuffetCatalog => ({ products, categories, ...overrides })

beforeEach(() => {
  api().reset()
  localStorage.clear()
  useSettingsStore.setState({ settings: { ...settings }, ratePlans, products, categories, logoUrl: null, logoError: null })
  useUiStore.setState({ toasts: [] })
})

afterEach(() => cleanup())

describe('branding settings', () => {
  it('previews the brand colour live and restores it when leaving without saving', () => {
    const { unmount } = render(<SettingsPage />)
    expect(brandVar()).toBe('#d4af37') // applied from the saved settings
    fireEvent.change(screen.getByLabelText('رنگ برند'), { target: { value: '#0A84FF' } })
    expect(brandVar()).toBe('#0a84ff') // live preview
    fireEvent.change(screen.getByLabelText('رنگ برند'), { target: { value: '#12' } })
    expect(brandVar()).toBe('#0a84ff') // incomplete input never applied
    expect(screen.getByText(/رنگ را به شکل/)).toBeTruthy()
    unmount()
    expect(brandVar()).toBe('#d4af37') // not saved → back to the saved brand
  })

  it('saves store name and brand colour; the app keeps the saved colour', async () => {
    api().api.updateSettings!.mockImplementation(async (input: Settings) => ({ ...input, brandColor: input.brandColor.toLowerCase() }))
    render(<SettingsPage />)
    fireEvent.change(screen.getByLabelText('نام مجموعه'), { target: { value: 'گیم‌نت آریا' } })
    fireEvent.click(screen.getByRole('radio', { name: 'بنفش' }))
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره‌ی تغییرات' }))
    await waitFor(() => expect(api().calls.updateSettings).toHaveBeenCalledTimes(1))
    expect(api().calls.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ storeName: 'گیم‌نت آریا', brandColor: '#bf5af2' }))
    await waitFor(() => expect(useSettingsStore.getState().settings?.brandColor).toBe('#bf5af2'))
    expect(brandVar()).toBe('#bf5af2')
    expect(localStorage.getItem('gameon:brand-color')).toBe('#bf5af2') // cached for the next launch
  })

  it('warns when the brand colour would be illegible on the dark canvas', () => {
    render(<SettingsPage />)
    fireEvent.change(screen.getByLabelText('رنگ برند'), { target: { value: '#1c1c1e' } })
    expect(screen.getByRole('alert').textContent).toContain('کم‌کنتراست')
  })

  it('picks a logo through the backend dialog, previews it, and saves the absolute path', async () => {
    api().api.pickLogoFile!.mockResolvedValue('/home/op/logo.png')
    api().api.readLogo!.mockResolvedValue('data:image/png;base64,AAAA')
    api().api.updateSettings!.mockImplementation(async (input: Settings) => input)
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: /انتخاب فایل/ }))
    await waitFor(() => expect(api().calls.readLogo).toHaveBeenCalledWith('/home/op/logo.png'))
    expect(await screen.findByAltText('لوگوی مجموعه')).toHaveProperty('src', 'data:image/png;base64,AAAA')
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره‌ی تغییرات' }))
    await waitFor(() => expect(api().calls.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ logoPath: '/home/op/logo.png' })))
  })

  it('shows why a saved logo cannot be read and lets it be removed', async () => {
    useSettingsStore.setState({ settings: { ...settings, logoPath: '/gone/logo.png' } })
    api().api.readLogo!.mockRejectedValue(new Error('فایل لوگو پیدا نشد.'))
    render(<SettingsPage />)
    expect(await screen.findByText('فایل لوگو پیدا نشد.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'حذف لوگو' }))
    expect(screen.queryByRole('button', { name: 'حذف لوگو' })).toBeNull()
  })
})

describe('category management', () => {
  const panel = () => screen.getByRole('list', { name: 'دسته‌ها' })

  it('lists categories with product counts and the uncategorised bucket', () => {
    render(<SettingsPage />)
    expect(panel().textContent).toContain('نوشیدنی')
    expect(panel().textContent).toContain('۲ کالا')
    expect(panel().textContent).toContain('بدون دسته۱ کالا')
  })

  it('creates a category (validated first)', async () => {
    api().api.createCategory!.mockResolvedValue(catalog())
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: /دسته‌ی جدید/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'افزودن دسته' }))
    expect(within(dialog).getByRole('alert').textContent).toContain('نام دسته')
    fireEvent.change(within(dialog).getByLabelText('نام'), { target: { value: 'نوشیدنی گرم' } })
    fireEvent.change(within(dialog).getByLabelText('رنگ'), { target: { value: 'blue' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'افزودن دسته' }))
    expect(within(dialog).getByRole('alert').textContent).toContain('رنگ')
    fireEvent.change(within(dialog).getByLabelText('رنگ'), { target: { value: '#FFAA00' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'افزودن دسته' }))
    await waitFor(() => expect(api().calls.createCategory).toHaveBeenCalledWith({ name: 'نوشیدنی گرم', color: '#FFAA00' }))
  })

  it('edits a category', async () => {
    api().api.updateCategory!.mockResolvedValue(catalog())
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'ویرایش تنقلات' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('radio', { name: 'زرد' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'ذخیره' }))
    await waitFor(() => expect(api().calls.updateCategory).toHaveBeenCalledWith(2, { name: 'تنقلات', color: '#ffd60a' }))
  })

  it('deletes a category, moving its products to another one in the same request', async () => {
    const remaining = categories.filter((c) => c.id !== 1).map((c) => (c.id === 2 ? { ...c, productCount: 3 } : c))
    api().api.deleteCategory!.mockResolvedValue(catalog({ categories: remaining }))
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'حذف نوشیدنی' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('۲ کالا در این دسته است')
    fireEvent.change(within(dialog).getByLabelText('انتقال کالاها به'), { target: { value: '2' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'حذف دسته' }))
    await waitFor(() => expect(api().calls.deleteCategory).toHaveBeenCalledWith(1, 2))
    expect(api().calls.deleteCategory).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(useSettingsStore.getState().categories.map((c) => c.id)).toEqual([2]))
  })

  it('deleting can also leave products uncategorised', async () => {
    api().api.deleteCategory!.mockResolvedValue(catalog())
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'حذف تنقلات' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'حذف دسته' }))
    await waitFor(() => expect(api().calls.deleteCategory).toHaveBeenCalledWith(2, null))
  })
})
