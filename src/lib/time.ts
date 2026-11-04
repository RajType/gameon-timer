import type { Session, SessionStatus } from '@/types'
import { toPersianDigits } from './currency'

export const SECOND_MS = 1_000
export const MINUTE_MS = 60 * SECOND_MS
export const HOUR_MS = 60 * MINUTE_MS

/*
 * Sessions are stored as segments with wall-clock timestamps, so elapsed time
 * stays correct across restarts and crashes: every render recomputes it.
 */

export function getOpenSegment(session: Session) {
  return session.segments.find((s) => s.endedAt === null)
}

export function getSessionStatus(session: Session): SessionStatus {
  return getOpenSegment(session) ? 'running' : 'paused'
}

/** Current hourly rate: the open segment's, else the agreed rate for the current count. */
export function getCurrentRate(session: Session): number | undefined {
  return (
    getOpenSegment(session)?.hourlyRate ??
    session.rates.find((r) => r.controllers === session.controllers)?.hourlyRate
  )
}

/** When the current pause began (end of the last segment), if paused. */
export function getPausedSince(session: Session): number | undefined {
  if (getOpenSegment(session)) return undefined
  return session.segments.reduce<number | undefined>(
    (latest, s) => (s.endedAt !== null && (latest === undefined || s.endedAt > latest) ? s.endedAt : latest),
    undefined,
  )
}

/** `3_909_000` → `"۰۱:۰۵:۰۹"`. Hours are not capped at 24. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / SECOND_MS)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return toPersianDigits(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`)
}

const clockFormat = new Intl.DateTimeFormat('fa-IR', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Local wall-clock time, e.g. `"۲۱:۰۵"`. */
export function formatClock(timestamp: number): string {
  return clockFormat.format(timestamp)
}

const dateFormat = new Intl.DateTimeFormat('fa-IR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/**
 * Solar Hijri (Jalali) date, e.g. `"چهارشنبه ۱۳ آبان ۱۴۰۵"`.
 * Assembled from parts because ICU's fa-IR full pattern differs across engines.
 */
export function formatDate(timestamp: number): string {
  const parts = dateFormat.formatToParts(timestamp)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  return `${get('weekday')} ${get('day')} ${get('month')} ${get('year')}`
}

/** `"۱۳ آبان ۱۴۰۵، ۲۱:۰۵"` */
export function formatDateTime(timestamp: number): string {
  const parts = dateFormat.formatToParts(timestamp)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  return `${get('day')} ${get('month')} ${get('year')}، ${formatClock(timestamp)}`
}

/** [start, end) of the local calendar day containing `timestamp`. */
export function localDayRange(timestamp: number): [number, number] {
  const d = new Date(timestamp)
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
  return [start, end]
}
