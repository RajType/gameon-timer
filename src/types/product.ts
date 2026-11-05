/** Product category (migration 0004). */
export interface Category {
  id: number
  name: string
  /** Lowercase `#rrggbb`. */
  color: string
  productCount: number
}

export interface CategoryInput {
  name: string
  color: string
}

/** A buffet menu item. */
export interface Product {
  id: string
  name: string
  /** `null` = uncategorised (fully usable). */
  categoryId: number | null
  /** Current unit price in Toman. */
  price: number
  active: boolean
  sortOrder: number
  /** Units on hand; `null` = not counted (always available). Never negative. */
  stockQuantity: number | null
}

export interface ProductInput {
  name: string
  categoryId: number | null
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
