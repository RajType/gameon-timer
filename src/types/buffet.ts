export type BuffetCategory = 'drink' | 'snack' | 'food'

/** A sellable menu item. */
export interface BuffetItem {
  id: string
  name: string
  category: BuffetCategory
  /** Unit price in Toman. */
  price: number
}

/**
 * An item added to a session. Name and price are copied at order time so later
 * menu edits never change an open tab or a closed invoice.
 */
export interface BuffetLine {
  itemId: string
  name: string
  unitPrice: number
  quantity: number
}
