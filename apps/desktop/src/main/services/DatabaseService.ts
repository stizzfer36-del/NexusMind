import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import { runMigrations } from '../migrations/runner.js'

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

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS swarm_sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        config_json TEXT NOT NULL,
        state_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS replay_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        node_id TEXT,
        agent_id TEXT,
        payload_json TEXT,
        duration_ms INTEGER,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES swarm_sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_replay_session ON replay_events(session_id, timestamp);
    `)

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
