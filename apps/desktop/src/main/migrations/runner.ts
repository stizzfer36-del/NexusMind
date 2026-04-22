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
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `)

  const checkStmt = db.prepare(
    'SELECT COUNT(*) as count FROM migrations WHERE version = $version'
  )

  const insertStmt = db.prepare(
    'INSERT INTO migrations (version, name, applied_at) VALUES ($version, $name, $applied_at)'
  )

  for (const migration of migrations) {
    const result = checkStmt.get({ version: migration.version }) as { count: number } | undefined
    if (result && result.count > 0) {
      continue
    }

    console.log(`[Migrations] Applying ${migration.version} — ${migration.name}`)

    const apply = db.transaction(() => {
      db.exec(migration.sql)
      insertStmt.run({
        version: migration.version,
        name: migration.name,
        applied_at: Date.now(),
      })
    })

    apply()
  }

  console.log('[Migrations] Up to date.')
}
