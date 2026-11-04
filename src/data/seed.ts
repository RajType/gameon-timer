import { toPersianDigits } from '@/lib/currency'
import type { BuffetItem, Station, StationKind } from '@/types'

/*
 * First-run defaults. Once the app has persisted state, these are ignored.
 * Rates and prices are placeholders (Toman) — adjust per store.
 */

const HOURLY_RATE: Record<StationKind, number> = {
  ps5: 150_000,
  ps4: 100_000,
  xbox: 120_000,
  pc: 80_000,
  vr: 200_000,
}

const LAYOUT: StationKind[] = ['ps5', 'ps5', 'ps5', 'ps5', 'ps5', 'ps5', 'ps4', 'ps4', 'ps4', 'ps4']

export const DEFAULT_STATIONS: Station[] = LAYOUT.map((kind, index) => ({
  id: `station-${index + 1}`,
  name: `ایستگاه ${toPersianDigits(index + 1)}`,
  kind,
  hourlyRate: HOURLY_RATE[kind],
  outOfService: false,
}))

export const BUFFET_MENU: BuffetItem[] = [
  { id: 'water', name: 'آب معدنی', category: 'drink', price: 10_000 },
  { id: 'soda', name: 'نوشابه', category: 'drink', price: 25_000 },
  { id: 'energy', name: 'نوشیدنی انرژی‌زا', category: 'drink', price: 60_000 },
  { id: 'coffee', name: 'قهوه', category: 'drink', price: 45_000 },
  { id: 'chips', name: 'چیپس', category: 'snack', price: 30_000 },
  { id: 'puff', name: 'پفک', category: 'snack', price: 25_000 },
  { id: 'cake', name: 'کیک', category: 'snack', price: 20_000 },
  { id: 'sandwich', name: 'ساندویچ', category: 'food', price: 120_000 },
]
