import type { Invoice } from './invoice'
import type { Category, Product } from './product'
import type { RatePlan, RateTier } from './rates'
import type { Session } from './session'
import type { Settings } from './settings'
import type { Station, StationKind } from './station'

export interface Floor {
  stations: Station[]
  /** Open sessions only. */
  sessions: Session[]
}

export interface Catalog {
  ratePlans: RatePlan[]
  products: Product[]
  categories: Category[]
}

/** Products and categories after a buffet admin change (counts move together). */
export interface BuffetCatalog {
  products: Product[]
  categories: Category[]
}

export interface Snapshot {
  floor: Floor
  catalog: Catalog
}

export interface DaySummary {
  invoiceCount: number
  revenue: number
}

export type LegacyStatus = 'none' | 'imported' | 'already_imported' | 'skipped' | 'failed'

export interface ImportSummary {
  stations: number
  ratePlans: number
  openSessions: number
  invoices: number
  orderLines: number
  warnings: string[]
}

export interface LegacyOutcome {
  status: LegacyStatus
  hash: string | null
  summary: ImportSummary | null
  error: string | null
}

export interface Bootstrap {
  initialized: boolean
  floor: Floor
  catalog: Catalog
  settings: Settings
  legacy: LegacyOutcome
}

/** Order commands also return the buffet items, so stock stays fresh everywhere. */
export interface OrderResult {
  floor: Floor
  products: Product[]
}

export interface CheckoutResult {
  invoice: Invoice
  floor: Floor
}

export type BackupKind = 'manual' | 'auto' | 'pre-migration' | 'pre-restore'

export interface BackupInfo {
  fileName: string
  path: string
  kind: BackupKind
  createdAt: number
  sizeBytes: number
}

export interface LegacyImportRecord {
  status: 'imported' | 'skipped' | 'failed'
  payloadHash: string
  payloadBytes: number
  detail: string
  createdAt: number
}

export interface StartupInfo {
  migratedFrom: number | null
  appliedMigrations: number[]
  preMigrationBackup: BackupInfo | null
  autoBackup: BackupInfo | null
  warnings: string[]
}

export interface DataInfo {
  dbPath: string
  backupsDir: string
  schemaVersion: number
  latestSchemaVersion: number
  sizeBytes: number
  invoiceCount: number
  backups: BackupInfo[]
  legacyImports: LegacyImportRecord[]
  startup: StartupInfo
}

export interface RestoreResult {
  report: { restoredFrom: string; restoredVersion: number; safetyBackup: BackupInfo }
  bootstrap: Bootstrap
}

export interface StationInput {
  name: string
  kind: StationKind
  ratePlanId: string
  enabled: boolean
}

export interface RatePlanInput {
  name: string
  tiers: RateTier[]
}
