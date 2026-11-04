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
