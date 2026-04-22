import type Database from 'better-sqlite3'

// Vite-specific: import all SQL files in this directory as raw strings at build time.
const migrationModules = import.meta.glob<string>('./*.sql', {
  eager: true,
  query: '?raw',
  import: 'default',
})

interface MigrationFile {
  version: number
  name: string
  sql: string
}

function parseMigrationFiles(): MigrationFile[] {
  const files: MigrationFile[] = []

  for (const [filePath, content] of Object.entries(migrationModules)) {
    const basename = filePath.split('/').pop()!
    const match = basename.match(/^(\d+)_(.+?)\.sql$/)
    if (!match) continue
    const version = parseInt(match[1], 10)
    const name = match[2]
    files.push({ version, name, sql: content })
  }

  return files.sort((a, b) => a.version - b.version)
}

export function runMigrations(db: Database.Database): void {
  const migrations = parseMigrationFiles()
  if (migrations.length === 0) {
    console.warn('[Migrations] No migration files found.')
    return
  }

  // Ensure the migrations tracking table exists.
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      run_at TEXT NOT NULL
    )
  `)

  const checkStmt = db.prepare(
    'SELECT 1 as found FROM _migrations WHERE name = ?'
  )

  const insertStmt = db.prepare(
    'INSERT INTO _migrations (name, run_at) VALUES (?, ?)'
  )

  for (const migration of migrations) {
    const result = checkStmt.get(migration.name) as { found: number } | undefined
    if (result) {
      continue
    }

    console.log(`[Migrations] Applying ${migration.version} — ${migration.name}`)

    const apply = db.transaction(() => {
      db.exec(migration.sql)
      insertStmt.run(migration.name, new Date().toISOString())
    })

    apply()
  }

  console.log('[Migrations] Up to date.')
}
