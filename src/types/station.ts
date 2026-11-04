/** Hardware family of a play station. Drives icon + label only, never pricing. */
export type StationKind = 'ps5' | 'ps4' | 'xbox' | 'pc' | 'vr'

export interface Station {
  id: string
  /** Display name, e.g. "PS5 · ۱". */
  name: string
  kind: StationKind
  /** Price per hour in Toman. Snapshotted onto a session when it starts. */
  hourlyRate: number
  /** Out-of-service stations cannot start sessions. */
  outOfService: boolean
}

/** Derived, never stored: computed from the station + its active session. */
export type StationStatus = 'available' | 'running' | 'paused' | 'maintenance'
