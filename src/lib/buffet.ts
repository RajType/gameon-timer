import type { Category, Product } from '@/types'
import { toPersianDigits } from './currency'

/** Must match `repo::MAX_ORDER_QUANTITY` in Rust. */
export const MAX_ORDER_QUANTITY = 99
/** At or below this many units a counted item is shown as running low. */
export const LOW_STOCK = 5

export const UNCATEGORIZED_LABEL = 'بدون دسته'
/** Neutral swatch for uncategorised items (matches --color-status-available). */
export const UNCATEGORIZED_COLOR = 'var(--color-status-available)'

/** Buffet list filter: everything, one category, or items without a category. */
export type CategoryFilter = 'all' | 'none' | number

export function filterByCategory<T extends Pick<Product, 'categoryId'>>(products: readonly T[], filter: CategoryFilter): T[] {
  if (filter === 'all') return [...products]
  if (filter === 'none') return products.filter((p) => p.categoryId === null)
  return products.filter((p) => p.categoryId === filter)
}

/** The product's category, or `undefined` when uncategorised (or the id is stale). */
export function categoryOf(product: Pick<Product, 'categoryId'>, categories: readonly Category[]): Category | undefined {
  return product.categoryId === null ? undefined : categories.find((c) => c.id === product.categoryId)
}

export type StockLevel = 'uncounted' | 'out' | 'low' | 'ok'

export function stockLevel(product: Pick<Product, 'stockQuantity'>): StockLevel {
  const stock = product.stockQuantity
  if (stock === null) return 'uncounted'
  if (stock <= 0) return 'out'
  return stock <= LOW_STOCK ? 'low' : 'ok'
}

export function stockLabel(product: Pick<Product, 'stockQuantity'>): string {
  const stock = product.stockQuantity
  if (stock === null) return 'بدون شمارش'
  return stock <= 0 ? 'ناموجود' : `${toPersianDigits(stock)} عدد`
}

/** Can at least one unit be ordered right now? (Mirrors the backend rule.) */
export function isAvailable(product: Pick<Product, 'active' | 'stockQuantity'>): boolean {
  return product.active && (product.stockQuantity === null || product.stockQuantity > 0)
}

/** Most units one order may take: the stock, capped by the per-order limit. */
export function maxOrderable(product: Pick<Product, 'active' | 'stockQuantity'>): number {
  if (!product.active) return 0
  const stock = product.stockQuantity
  return stock === null ? MAX_ORDER_QUANTITY : Math.max(0, Math.min(MAX_ORDER_QUANTITY, stock))
}

/**
 * Client-side mirror of `admin::validate_product` for instant feedback (the
 * backend validates again). `null` fields = empty inputs.
 */
export function validateProduct(input: {
  name: string
  price: number | null
  counted: boolean
  stock: number | null
}): string | null {
  if (input.name.trim() === '') return 'نام کالا را وارد کنید.'
  if (input.price === null) return 'قیمت را وارد کنید.'
  if (input.counted && input.stock === null) return 'موجودی را وارد کنید (عدد صفر یا بیشتر).'
  return null
}
