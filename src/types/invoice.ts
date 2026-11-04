import type { RoundingMode } from './settings'

export interface InvoiceLine {
  kind: 'time' | 'item'
  label: string
  productId: string | null
  controllers: number | null
  durationMs: number | null
  /** Hourly rate for time lines; unit price for items. */
  unitPrice: number
  quantity: number
  amount: number
}

/** An immutable, closed bill. All amounts are integer Toman. */
export interface Invoice {
  id: string
  number: number
  sessionId: string
  stationId: string
  stationName: string
  stationKind: string
  startedAt: number
  endedAt: number
  playedMs: number
  pausedMs: number
  timeTotal: number
  ordersTotal: number
  /** timeTotal + ordersTotal */
  subtotal: number
  roundingUnit: number
  roundingMode: RoundingMode
  /** total − subtotal */
  rounding: number
  total: number
  storeName: string
  receiptHeader: string
  receiptFooter: string
  source: 'app' | 'legacy'
  lines: InvoiceLine[]
}
