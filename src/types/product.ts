export type ProductCategory = 'drink' | 'snack' | 'food'

/** A buffet menu item. */
export interface Product {
  id: string
  name: string
  category: ProductCategory
  /** Current unit price in Toman. */
  price: number
  active: boolean
  sortOrder: number
  /** Units on hand; `null` = not counted (always available). Never negative. */
  stockQuantity: number | null
}

export interface ProductInput {
  name: string
  category: ProductCategory
  price: number
  active: boolean
  /** `null` = do not count stock for this item. */
  stockQuantity: number | null
}

/**
 * An item on a session's tab. Name and unit price are copied when ordered,
 * so menu edits never change an open tab or a closed invoice.
 */
export interface OrderItem {
  id: number
  productId: string | null
  name: string
  unitPrice: number
  quantity: number
}
