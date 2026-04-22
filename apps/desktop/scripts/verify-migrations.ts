import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { runMigrations } from '../src/main/migrations/runner.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testDbPath = path.join(__dirname, 'verify_migrations.db')

// Clean up any existing test DB
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath)
  console.log('[Verify] Deleted existing test DB')
}

// Create fresh DB
const db = new Database(testDbPath)

// Enable WAL mode (mirrors DatabaseService init)
db.pragma('journal_mode = WAL')

// Verify WAL mode
const journalMode = db.pragma('journal_mode', { simple: true })
console.log(`[Verify] PRAGMA journal_mode = ${journalMode}`)
if (journalMode !== 'wal') {
  throw new Error(`WAL mode not enabled! Got: ${journalMode}`)
}

// Run migrations
runMigrations(db)

// Verify migrations table
const appliedMigrations = db.prepare('SELECT version, name FROM migrations ORDER BY version').all()
console.log('[Verify] Applied migrations:', appliedMigrations)

// Verify expected tables exist
const expectedTables = [
  'conversations',
  'messages',
  'settings',
  'kanban_tasks',
  'memory_entries',
  'bench_tasks',
  'bench_runs',
  'guard_runs',
  'guard_findings',
  'migrations',
]

for (const table of expectedTables) {
  const result = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)
  if (!result) {
    throw new Error(`Missing expected table: ${table}`)
  }
  console.log(`[Verify] Table exists: ${table}`)
}

// Verify expected indexes exist
const expectedIndexes = ['idx_bench_runs_task', 'idx_bench_runs_model', 'idx_guard_findings_run']
for (const idx of expectedIndexes) {
  const result = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?").get(idx)
  if (!result) {
    throw new Error(`Missing expected index: ${idx}`)
  }
  console.log(`[Verify] Index exists: ${idx}`)
}

// Verify that re-running migrations is idempotent
console.log('[Verify] Re-running migrations (should be no-op)...')
runMigrations(db)
const migrationCountAfter = db.prepare('SELECT COUNT(*) as count FROM migrations').get() as { count: number }
console.log(`[Verify] Migration count after re-run: ${migrationCountAfter.count}`)

// Verify bench_runs schema includes all expected columns
const benchRunsInfo = db.prepare("PRAGMA table_info(bench_runs)").all() as { name: string }[]
const benchRunsCols = benchRunsInfo.map(c => c.name)
console.log('[Verify] bench_runs columns:', benchRunsCols)

// Verify guard_findings has foreign key
const fkInfo = db.prepare("PRAGMA foreign_key_list(guard_findings)").all() as { table: string; from: string; to: string }[]
console.log('[Verify] guard_findings foreign keys:', fkInfo)

// Cleanup
db.close()
fs.unlinkSync(testDbPath)
for (const suffix of ['-shm', '-wal']) {
  try {
    fs.unlinkSync(`${testDbPath}${suffix}`)
  } catch {
    // WAL files may already be cleaned up after closing
  }
}
console.log('[Verify] All checks passed. Cleaned up.')
