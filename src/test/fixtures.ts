// Shared test data (not imported by the app).
import type { Category, Invoice, Product, RatePlan, Session, Settings, Station } from '@/types'

export const MIN = 60_000
/** 2026-11-04T17:30:00Z */
export const T0 = Date.UTC(2026, 10, 4, 17, 30, 0)

export const settings: Settings = {
  storeName: 'گیم‌آن',
  receiptHeader: '',
  receiptFooter: '',
  roundingUnit: 1000,
  roundingMode: 'nearest',
  soundEnabled: false,
  soundPreset: 'chime',
  soundVolume: 0,
  alertEveryMinutes: 0,
  longPauseMinutes: 0,
  brandColor: '#d4af37',
  logoPath: '',
}

export const categories: Category[] = [
  { id: 1, name: 'نوشیدنی', color: '#64d2ff', productCount: 2 },
  { id: 2, name: 'تنقلات', color: '#bf5af2', productCount: 1 },
]

export const ratePlans: RatePlan[] = [
  {
    id: 'plan-ps5',
    name: 'PS5',
    stationCount: 4,
    tiers: [
      { controllers: 1, hourlyRate: 150_000 },
      { controllers: 2, hourlyRate: 150_000 },
    ],
  },
]

/** Counted with stock, not counted, sold out, inactive + uncategorised. */
export const products: Product[] = [
  { id: 'soda', name: 'نوشابه', categoryId: 1, price: 25_000, active: true, sortOrder: 0, stockQuantity: 3 },
  { id: 'coffee', name: 'قهوه', categoryId: 1, price: 45_000, active: true, sortOrder: 1, stockQuantity: null },
  { id: 'cake', name: 'کیک', categoryId: 2, price: 20_000, active: true, sortOrder: 2, stockQuantity: 0 },
  { id: 'old', name: 'کالای قدیمی', categoryId: null, price: 10_000, active: false, sortOrder: 3, stockQuantity: null },
]

const station = (n: number, posX: number, posY: number, enabled = true): Station => ({
  id: `station-${n}`,
  name: `ایستگاه ${'۰۱۲۳۴۵۶۷۸۹'[n]}`,
  kind: 'ps5',
  ratePlanId: 'plan-ps5',
  enabled,
  sortOrder: n,
  posX,
  posY,
})

/**
 * Layout chosen so reading order (rows top→bottom, right→left) differs from
 * sort order: station 3 is unplaced (default slot, top row), station 2 is
 * right of station 1 in the second row, station 4 is disabled.
 */
export function stations(): Station[] {
  return [station(1, 40, 360), station(2, 880, 360), station(3, 0, 0), station(4, 600, 700, false)]
}

export function runningSession(stationId = 'station-1', startedAt = T0 - 30 * MIN): Session {
  return {
    id: `session-${stationId}`,
    stationId,
    ratePlanName: 'PS5',
    controllers: 2,
    startedAt,
    rates: ratePlans[0]!.tiers,
    segments: [{ startedAt, endedAt: null, controllers: 2, hourlyRate: 150_000 }],
    orders: [],
  }
}

export function invoiceFor(session: Session, at: number, total: number): Invoice {
  return {
    id: 'inv-1',
    number: 7,
    sessionId: session.id,
    stationId: session.stationId,
    stationName: 'ایستگاه ۱',
    stationKind: 'ps5',
    startedAt: session.startedAt,
    endedAt: at,
    playedMs: at - session.startedAt,
    pausedMs: 0,
    timeTotal: total,
    ordersTotal: 0,
    subtotal: total,
    roundingUnit: 1000,
    roundingMode: 'nearest',
    rounding: 0,
    total,
    storeName: 'گیم‌آن',
    receiptHeader: '',
    receiptFooter: '',
    source: 'app',
    lines: [
      {
        kind: 'time',
        label: 'زمان بازی (۲ دسته)',
        productId: null,
        controllers: 2,
        durationMs: at - session.startedAt,
        unitPrice: 150_000,
        quantity: 1,
        amount: total,
      },
    ],
  }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
