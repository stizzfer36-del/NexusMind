import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import type { DatabaseService } from './DatabaseService.js'

const DEFAULTS = {
  theme: 'system' as 'light' | 'dark' | 'system',
  language: 'en',
  defaultModel: 'claude-opus-4-7',
  windowBounds: { width: 1280, height: 800 } as { width: number; height: number; x?: number; y?: number },
  telemetryEnabled: false,
  onboardingComplete: false,
}

export class SettingsService {
  private db!: DatabaseService

  async init(): Promise<void> {
    this.db = ServiceRegistry.getInstance().resolve<DatabaseService>(SERVICE_TOKENS.DB)
    ServiceRegistry.getInstance().register(SERVICE_TOKENS.Settings, this)
  }

  get<T>(key: string, defaultValue: T): T {
    const row = this.db.getDb()
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as { value: string } | undefined

    if (!row) return defaultValue

    try {
      return JSON.parse(row.value) as T
    } catch {
      return defaultValue
    }
  }

  set<T>(key: string, value: T): void {
    this.db.getDb()
      .prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run(key, JSON.stringify(value), Date.now())
  }

  delete(key: string): void {
    this.db.getDb()
      .prepare('DELETE FROM settings WHERE key = ?')
      .run(key)
  }

  getAll(): Record<string, unknown> {
    const rows = this.db.getDb()
      .prepare('SELECT key, value FROM settings')
      .all() as { key: string; value: string }[]

    const result: Record<string, unknown> = { ...DEFAULTS }

    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value)
      } catch {
        result[row.key] = row.value
      }
    }

    return result
  }

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'settings:get': (_event: any, key: string) =>
        this.get(key, (DEFAULTS as any)[key] ?? null),
      'settings:set': (_event: any, payload: { key: string; value: unknown }) =>
        this.set(payload.key, payload.value),
      'settings:delete': (_event: any, key: string) =>
        this.delete(key),
      'settings:getAll': () =>
        this.getAll(),
    }
  }
}
