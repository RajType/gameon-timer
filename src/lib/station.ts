import type { Session, Station, StationKind, StationStatus } from '@/types'

export const STATION_KIND_LABEL: Record<StationKind, string> = {
  ps5: 'PS5',
  ps4: 'PS4',
  xbox: 'Xbox',
  pc: 'PC',
  vr: 'VR',
}

export const STATION_STATUS_LABEL: Record<StationStatus, string> = {
  available: 'آزاد',
  running: 'در حال بازی',
  paused: 'متوقف',
  maintenance: 'خارج از سرویس',
}

export function getStationStatus(station: Station, session: Session | undefined): StationStatus {
  if (session) return session.pausedAt === null ? 'running' : 'paused'
  return station.outOfService ? 'maintenance' : 'available'
}
