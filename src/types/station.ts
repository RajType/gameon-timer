export type StationKind = 'ps5' | 'ps4' | 'xbox' | 'vip'

export interface Station {
  id: string
  /** Display name, e.g. "ایستگاه ۱". */
  name: string
  kind: StationKind
  ratePlanId: string
  /** Disabled stations show as out of service and cannot start sessions. */
  enabled: boolean
  sortOrder: number
  /**
   * Floor-map position in px from the board's top-left corner (migration
   * 0002). Physical room coordinates, so not mirrored for RTL.
   * `0, 0` = not placed yet (the database default).
   */
  posX: number
  posY: number
}

/** Derived, never stored: computed from the station + its open session. */
export type StationStatus = 'available' | 'running' | 'paused' | 'maintenance'
