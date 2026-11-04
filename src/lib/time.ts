import type { Session, SessionStatus } from '@/types'
import { toPersianDigits } from './currency'

export const SECOND_MS = 1_000
export const MINUTE_MS = 60 * SECOND_MS
export const HOUR_MS = 60 * MINUTE_MS

/*
 * Session timing model
 * --------------------
 *   played = (pausedAt ?? now) − startedAt − pausedMs
 *
 * Only timestamps are persisted, so a restart (or a crash) never loses or
 * double-counts time: the next render simply recomputes from the wall clock.
 */

export function getSessionStatus(session: Session): SessionStatus {
  return session.pausedAt === null ? 'running' : 'paused'
}

/** Total paused time, including a pause that is still in progress. */
export function getPausedMs(session: Session, now: number): number {
  const ongoing = session.pausedAt === null ? 0 : Math.max(0, now - session.pausedAt)
  return session.pausedMs + ongoing
}

/** Billable play time at `now`. Frozen while paused. */
export function getPlayedMs(session: Session, now: number): number {
  const end = session.pausedAt ?? now
  return Math.max(0, end - session.startedAt - session.pausedMs)
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

/** True when both timestamps fall on the same local calendar day. */
export function isSameLocalDay(a: number, b: number): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}
