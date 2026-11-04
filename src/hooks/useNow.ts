import { useSyncExternalStore } from 'react'

/*
 * One shared, second-aligned clock for the whole app.
 *
 * Every live timer subscribes to the same ticker, so N station cards cost one
 * timeout — not N intervals — and all of them flip digits on the same frame.
 * The ticker only runs while at least one component is subscribed.
 */

let now = Date.now()
let timeout: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

function tick() {
  now = Date.now()
  for (const listener of listeners) listener()
  schedule()
}

function schedule() {
  // Fire just after the next wall-clock second boundary.
  timeout = setTimeout(tick, 1000 - (Date.now() % 1000) + 5)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    now = Date.now()
    schedule()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      clearTimeout(timeout)
      timeout = undefined
    }
  }
}

const getSnapshot = () => now

/** Current epoch ms, re-rendering once per second. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot)
}
