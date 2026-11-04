/** Hourly price (Toman) for a given number of controllers. */
export interface RateTier {
  controllers: number
  hourlyRate: number
}

export interface RatePlan {
  id: string
  name: string
  /** Sorted by controller count. */
  tiers: RateTier[]
  stationCount: number
}
