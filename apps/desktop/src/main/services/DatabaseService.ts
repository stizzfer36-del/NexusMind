import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'

const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, title TEXT, created_at INTEGER, updated_at INTEGER, model_id TEXT, system_prompt TEXT);
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, conversation_id TEXT, role TEXT, content TEXT, created_at INTEGER, token_count INTEGER, cost_real REAL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER);
CREATE TABLE IF NOT EXISTS kanban_tasks (id TEXT PRIMARY KEY, title TEXT, description TEXT, column_id TEXT, position INTEGER, agent_id TEXT, created_at INTEGER, updated_at INTEGER, tags TEXT, priority TEXT);
CREATE TABLE IF NOT EXISTS memory_entries (id TEXT PRIMARY KEY, type TEXT, content TEXT, embedding_json TEXT, source TEXT, created_at INTEGER, updated_at INTEGER, relevance_score REAL);
CREATE TABLE IF NOT EXISTS bench_tasks (
  id TEXT PRIMARY KEY,
  dimension TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  input TEXT NOT NULL,
  expected_behavior TEXT,
  metadata TEXT
);
CREATE TABLE IF NOT EXISTS bench_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  dimension TEXT NOT NULL,
  model_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cost_usd REAL,
  success_score REAL NOT NULL,
  notes TEXT,
  raw_response_preview TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bench_runs_task ON bench_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_bench_runs_model ON bench_runs(model_id);
`

export class DatabaseService {
  private db!: Database.Database

  async init(): Promise<void> {
    const dbPath = path.join(app.getPath('userData'), 'nexusmind.db')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.runMigrations()
    ServiceRegistry.getInstance().register(SERVICE_TOKENS.DB, this)
  }

  getDb(): Database.Database {
    return this.db
  }

  runMigrations(): void {
    this.db.exec(MIGRATIONS)
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
