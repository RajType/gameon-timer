import { describe, expect, it } from 'vitest'
import { isAvailable, LOW_STOCK, MAX_ORDER_QUANTITY, maxOrderable, stockLabel, stockLevel, validateProduct } from './buffet'

const item = (stockQuantity: number | null, active = true) => ({ stockQuantity, active })

describe('buffet stock helpers', () => {
  it('classifies stock levels and labels them in Persian', () => {
    expect([stockLevel(item(null)), stockLevel(item(0)), stockLevel(item(LOW_STOCK)), stockLevel(item(LOW_STOCK + 1))]).toEqual([
      'uncounted',
      'out',
      'low',
      'ok',
    ])
    expect(stockLabel(item(null))).toBe('بدون شمارش')
    expect(stockLabel(item(0))).toBe('ناموجود')
    expect(stockLabel(item(12))).toBe('۱۲ عدد')
  })

  it('availability mirrors the backend rule (active, and not sold out)', () => {
    expect(isAvailable(item(null))).toBe(true)
    expect(isAvailable(item(1))).toBe(true)
    expect(isAvailable(item(0))).toBe(false)
    expect(isAvailable(item(10, false))).toBe(false)
  })

  it('an order is capped by stock and by the per-order limit', () => {
    expect(maxOrderable(item(3))).toBe(3)
    expect(maxOrderable(item(500))).toBe(MAX_ORDER_QUANTITY)
    expect(maxOrderable(item(null))).toBe(MAX_ORDER_QUANTITY)
    expect(maxOrderable(item(0))).toBe(0)
    expect(maxOrderable(item(5, false))).toBe(0)
  })

  it('validates the product form', () => {
    const ok = { name: 'آبمیوه', price: 35_000, counted: true, stock: 0 }
    expect(validateProduct(ok)).toBeNull()
    expect(validateProduct({ ...ok, name: '  ' })).toContain('نام')
    expect(validateProduct({ ...ok, price: null })).toContain('قیمت')
    expect(validateProduct({ ...ok, stock: null })).toContain('موجودی')
    expect(validateProduct({ ...ok, counted: false, stock: null })).toBeNull()
  })
})
