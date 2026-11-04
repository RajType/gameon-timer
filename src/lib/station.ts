import type { RatePlan, Session, Station, StationKind, StationStatus } from '@/types'
import { getSessionStatus } from './time'

export const STATION_KINDS: readonly StationKind[] = ['ps5', 'ps4', 'xbox', 'vip']

export const STATION_KIND_LABEL: Record<StationKind, string> = {
  ps5: 'PS5',
  ps4: 'PS4',
  xbox: 'Xbox',
  vip: 'VIP',
}

export const STATION_STATUS_LABEL: Record<StationStatus, string> = {
  available: 'آزاد',
  running: 'در حال بازی',
  paused: 'متوقف',
  maintenance: 'خارج از سرویس',
}

export function getStationStatus(station: Station, session: Session | undefined): StationStatus {
  if (session) return getSessionStatus(session)
  return station.enabled ? 'available' : 'maintenance'
}

/** Cheapest tier of a plan — shown as "from" price on idle stations. */
export function lowestRate(plan: RatePlan | undefined): number | undefined {
  if (!plan || plan.tiers.length === 0) return undefined
  return Math.min(...plan.tiers.map((t) => t.hourlyRate))
}
