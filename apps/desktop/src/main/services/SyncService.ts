import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import { WindowManager } from '../windows/WindowManager.js'
import type { DatabaseService } from './DatabaseService.js'
import type { SyncConfig, SyncSummary } from '@nexusmind/shared'

const SETTINGS_KEY = 'nexussync'
const DEFAULT_CONFIG: SyncConfig = { enabled: false }
const DEFAULT_SUMMARY: SyncSummary = { lastStatus: 'idle', itemsUploaded: 0, itemsPending: 0 }

export class SyncService {
  private config: SyncConfig = { ...DEFAULT_CONFIG }
  private summary: SyncSummary = { ...DEFAULT_SUMMARY }
  private db: DatabaseService | null = null

  async init(): Promise<void> {
    ServiceRegistry.getInstance().register(SERVICE_TOKENS.SyncService, this)
    const registry = ServiceRegistry.getInstance()
    try {
      this.db = registry.resolve<DatabaseService>(SERVICE_TOKENS.DB)
    } catch {}
    try {
      const settings = registry.resolve(SERVICE_TOKENS.Settings) as any
      const saved = settings.get(SETTINGS_KEY, DEFAULT_CONFIG)
      this.config = { ...DEFAULT_CONFIG, ...saved }
    } catch {}
  }

  getConfig(): SyncConfig {
    return { ...this.config }
  }

  setConfig(config: SyncConfig): void {
    this.config = { ...config }
    try {
      const settings = ServiceRegistry.getInstance().resolve(SERVICE_TOKENS.Settings) as any
      settings.set(SETTINGS_KEY, config)
    } catch {}
  }

  getSummary(): SyncSummary {
    return { ...this.summary }
  }

  async triggerSync(): Promise<SyncSummary> {
    this.summary = { ...this.summary, lastStatus: 'in-progress' }
    this.pushStatus()

    await new Promise<void>(resolve => setTimeout(resolve, 200))

    try {
      let total = 0
      if (this.db) {
        const db = this.db.getDb()
        for (const table of ['bench_runs', 'replay_sessions', 'guard_runs']) {
          try {
            const row = db.prepare(`SELECT COUNT(*) AS cnt FROM ${table}`).get() as { cnt: number } | undefined
            total += row?.cnt ?? 0
          } catch { /* table may not exist yet */ }
        }
      }
      this.summary = {
        lastSyncAt: Date.now(),
        lastStatus: 'ok',
        itemsUploaded: total,
        itemsPending: 0,
      }
    } catch (err) {
      this.summary = {
        ...this.summary,
        lastStatus: 'error',
        lastError: err instanceof Error ? err.message : 'Unknown error',
        itemsPending: 0,
      }
    }

    this.pushStatus()
    return { ...this.summary }
  }

  private pushStatus(): void {
    const win = WindowManager.getInstance().get('main')
    win?.webContents.send('sync:statusChange', this.summary)
  }

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'sync:getConfig':  (_event: any) => this.getConfig(),
      'sync:setConfig':  (_event: any, config: SyncConfig) => this.setConfig(config),
      'sync:getSummary': (_event: any) => this.getSummary(),
      'sync:trigger':    (_event: any) => this.triggerSync(),
    }
  }
}
