export type SyncStatus = 'idle' | 'in-progress' | 'ok' | 'error'

export interface SyncConfig {
  enabled: boolean
  endpoint?: string
  apiKey?: string
}

export interface SyncSummary {
  lastSyncAt?: number
  lastStatus: SyncStatus
  lastError?: string
  itemsUploaded: number
  itemsPending: number
}
