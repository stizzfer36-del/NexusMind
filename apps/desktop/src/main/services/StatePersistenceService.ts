import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import type { DatabaseService } from './DatabaseService.js'

interface PersistedState {
  storeName: string
  state: Record<string, unknown>
  timestamp: number
}

export class StatePersistenceService {
  private db!: DatabaseService

  init(): void {
    this.db = ServiceRegistry.getInstance().resolve<DatabaseService>(SERVICE_TOKENS.DB)
    this.ensureTable()
    ServiceRegistry.getInstance().register(SERVICE_TOKENS.StatePersistence, this)
  }

  private ensureTable(): void {
    this.db.getDb().exec(`
      CREATE TABLE IF NOT EXISTS persisted_state (
        store_name TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_persisted_state_updated ON persisted_state(updated_at);
    `)
  }

  saveState(storeName: string, state: Record<string, unknown>): void {
    const stateJson = JSON.stringify(state)
    const timestamp = Date.now()

    this.db.getDb()
      .prepare(`
        INSERT OR REPLACE INTO persisted_state (store_name, state_json, updated_at)
        VALUES (?, ?, ?)
      `)
      .run(storeName, stateJson, timestamp)
  }

  loadState(storeName: string): Record<string, unknown> | null {
    const row = this.db.getDb()
      .prepare('SELECT state_json FROM persisted_state WHERE store_name = ?')
      .get(storeName) as { state_json: string } | undefined

    if (!row) return null

    try {
      return JSON.parse(row.state_json)
    } catch {
      return null
    }
  }

  loadAllStates(): Record<string, Record<string, unknown>> {
    const rows = this.db.getDb()
      .prepare('SELECT store_name, state_json FROM persisted_state')
      .all() as Array<{ store_name: string; state_json: string }>

    const states: Record<string, Record<string, unknown>> = {}

    for (const row of rows) {
      try {
        states[row.store_name] = JSON.parse(row.state_json)
      } catch {
        // Skip malformed entries
      }
    }

    return states
  }

  clearState(storeName: string): void {
    this.db.getDb()
      .prepare('DELETE FROM persisted_state WHERE store_name = ?')
      .run(storeName)
  }

  clearAllStates(): void {
    this.db.getDb().prepare('DELETE FROM persisted_state').run()
  }

  getLastUpdateTime(storeName: string): number | null {
    const row = this.db.getDb()
      .prepare('SELECT updated_at FROM persisted_state WHERE store_name = ?')
      .get(storeName) as { updated_at: number } | undefined

    return row?.updated_at ?? null
  }

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'state:save': (_event: any, storeName: string, state: Record<string, unknown>) => {
        this.saveState(storeName, state)
        return { success: true }
      },
      'state:load': (_event: any, storeName: string) => {
        return this.loadState(storeName)
      },
      'state:loadAll': () => {
        return this.loadAllStates()
      },
      'state:clear': (_event: any, storeName: string) => {
        this.clearState(storeName)
        return { success: true }
      },
      'state:clearAll': () => {
        this.clearAllStates()
        return { success: true }
      },
    }
  }
}
