export type RoundingMode = 'nearest' | 'up' | 'down'
export type SoundPreset = 'chime' | 'bell' | 'beep'

export interface RoundingRule {
  /** 0 = no rounding. */
  unit: number
  mode: RoundingMode
}

export interface Settings {
  storeName: string
  receiptHeader: string
  receiptFooter: string
  roundingUnit: number
  roundingMode: RoundingMode
  soundEnabled: boolean
  soundPreset: SoundPreset
  /** 0–100 */
  soundVolume: number
  /** Alert each time a running session completes this many minutes (0 = off). */
  alertEveryMinutes: number
  /** Alert once when a session stays paused this long (0 = off). */
  longPauseMinutes: number
}
