import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import { runMigrations } from './migrations/runner.js'

export class DatabaseService {
  private db!: Database.Database

  async init(): Promise<void> {
    const dbPath = path.join(app.getPath('userData'), 'nexusmind.db')
    this.db = new Database(dbPath)

    // Enable WAL mode for better concurrency and performance.
    this.db.pragma('journal_mode = WAL')

    // Verify WAL mode is active.
    const journalMode = this.db.pragma('journal_mode', { simple: true })
    if (journalMode !== 'wal') {
      throw new Error(`Failed to enable WAL mode. Current mode: ${journalMode}`)
    }
    console.log(`[Database] WAL mode enabled (journal_mode=${journalMode})`)

    runMigrations(this.db)

    ServiceRegistry.getInstance().register(SERVICE_TOKENS.DB, this)
  }

  getDb(): Database.Database {
    return this.db
  }

  close(): void {
    this.db.close()
  }

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'db:query': (_event: any, sql: string, params: unknown[] = []) =>
        this.db.prepare(sql).all(...params),
      'db:run': (_event: any, sql: string, params: unknown[] = []) =>
        this.db.prepare(sql).run(...params),
      'db:get': (_event: any, sql: string, params: unknown[] = []) =>
        this.db.prepare(sql).get(...params),
    }
  }
}
