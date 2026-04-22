import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

vi.mock('electron', () => ({
  BrowserWindow: class MockBrowserWindow {
    static getAllWindows() {
      return []
    }
    on = vi.fn(() => this)
    once = vi.fn(() => this)
    isDestroyed() {
      return false
    }
    close() {}
    webContents = { send: vi.fn() }
  },
  app: {
    getPath: () => '/tmp/test-data',
    getAppPath: () => '/tmp/test-app',
  },
}))

vi.mock('./GuardScanners.js', () => ({
  runSemgrepScan: vi.fn(async () => ({ findings: [] })),
  runNpmAudit: vi.fn(async () => ({ findings: [] })),
  runSecretsScan: vi.fn(async () => ({ findings: [] })),
}))

import { GuardService } from './GuardService.js'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import { WindowManager } from '../windows/WindowManager.js'

// In-memory mock Database for tests (avoids better-sqlite3 native bindings)
class MockDb {
  private tables: Map<string, Array<Record<string, any>>> = new Map()

  exec(sql: string) {
    const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)\s*\((.*)\)/is)
    if (match) {
      const tableName = match[1]
      if (!this.tables.has(tableName)) {
        this.tables.set(tableName, [])
      }
    }
  }

  prepare(sql: string) {
    const normalized = sql.trim().replace(/\s+/g, ' ')
    const self = this

    return {
      run: (...params: any[]) => {
        const insertMatch = normalized.match(/INSERT INTO (\w+) \(([^)]+)\) VALUES \(([^)]+)\)/i)
        if (insertMatch) {
          const tableName = insertMatch[1]
          const cols = insertMatch[2].split(',').map((c) => c.trim())
          const valuesStr = insertMatch[3]
          // Split values by comma, but be careful with strings
          const values: string[] = []
          let current = ''
          let inString = false
          for (let i = 0; i < valuesStr.length; i++) {
            const ch = valuesStr[i]
            if (ch === "'") {
              inString = !inString
              current += ch
            } else if (ch === ',' && !inString) {
              values.push(current.trim())
              current = ''
            } else {
              current += ch
            }
          }
          if (current.trim()) values.push(current.trim())

          const row: Record<string, any> = {}
          let paramIdx = 0
          values.forEach((val, i) => {
            const col = cols[i]
            if (val === '?') {
              row[col] = params[paramIdx++] ?? null
            } else if (val.startsWith("'") && val.endsWith("'")) {
              row[col] = val.slice(1, -1)
            } else {
              const num = Number(val)
              row[col] = Number.isNaN(num) ? val : num
            }
          })
          if (!self.tables.has(tableName)) self.tables.set(tableName, [])
          self.tables.get(tableName)!.push(row)
        }
        const deleteMatch = normalized.match(/DELETE FROM (\w+)/i)
        if (deleteMatch) {
          const tableName = deleteMatch[1]
          self.tables.set(tableName, [])
        }
        const updateMatch = normalized.match(/UPDATE (\w+) SET (.+) WHERE (.+)/i)
        if (updateMatch) {
          const tableName = updateMatch[1]
          const setPart = updateMatch[2]
          const wherePart = updateMatch[3]
          const rows = self.tables.get(tableName) ?? []
          // Parse WHERE id = ?
          const whereIdMatch = wherePart.match(/id\s*=\s*\?/)
          if (whereIdMatch) {
            const targetId = params[params.length - 1]
            const row = rows.find((r) => r.id === targetId)
            if (row) {
              // Parse simple SET col = ?
              const setMatches = setPart.matchAll(/(\w+)\s*=\s*\?/g)
              let paramIdx = 0
              for (const m of setMatches) {
                row[m[1]] = params[paramIdx++]
              }
            }
          }
        }
      },
      get: (...params: any[]) => {
        // SELECT * FROM guard_runs WHERE status = 'COMPLETED' ORDER BY started_at DESC LIMIT 1
        const selectMatch = normalized.match(/SELECT \* FROM (\w+)(?: WHERE (.+?))?(?: ORDER BY (.+?))?(?: LIMIT (\d+))?/i)
        if (selectMatch) {
          const tableName = selectMatch[1]
          let rows = self.tables.get(tableName) ?? []
          const wherePart = selectMatch[2]
          if (wherePart) {
            // status = 'COMPLETED'
            const eqMatch = wherePart.match(/(\w+)\s*=\s*['"]?([^'"?]+)['"]?/)
            if (eqMatch) {
              rows = rows.filter((r) => r[eqMatch[1]] === eqMatch[2])
            } else {
              // key = ?
              const qMatch = wherePart.match(/(\w+)\s*=\s*\?/)
              if (qMatch) {
                rows = rows.filter((r) => r[qMatch[1]] === params[0])
              }
            }
          }
          const orderPart = selectMatch[3]
          if (orderPart) {
            const desc = orderPart.includes('DESC')
            const col = orderPart.replace(/DESC|ASC/gi, '').trim()
            rows = [...rows].sort((a, b) => {
              if (desc) return (b[col] ?? 0) - (a[col] ?? 0)
              return (a[col] ?? 0) - (b[col] ?? 0)
            })
          }
          const limit = selectMatch[4]
          if (limit) {
            rows = rows.slice(0, parseInt(limit))
          }
          return rows[0] ?? null
        }
        return null
      },
      all: (...params: any[]) => {
        const selectMatch = normalized.match(/SELECT (.+) FROM (\w+)(?: WHERE (.+?))?(?: ORDER BY (.+?))?(?: LIMIT (\d+))?/i)
        if (selectMatch) {
          const tableName = selectMatch[2]
          let rows = self.tables.get(tableName) ?? []
          const wherePart = selectMatch[3]
          if (wherePart) {
            const eqMatch = wherePart.match(/(\w+)\s*=\s*['"]?([^'"?]+)['"]?/)
            if (eqMatch) {
              rows = rows.filter((r) => r[eqMatch[1]] === eqMatch[2])
            } else {
              const qMatch = wherePart.match(/(\w+)\s*=\s*\?/)
              if (qMatch) {
                rows = rows.filter((r) => r[qMatch[1]] === params[0])
              }
            }
          }
          const orderPart = selectMatch[4]
          if (orderPart) {
            const desc = orderPart.includes('DESC')
            const col = orderPart.replace(/DESC|ASC/gi, '').trim()
            rows = [...rows].sort((a, b) => {
              if (desc) return (b[col] ?? 0) - (a[col] ?? 0)
              return (a[col] ?? 0) - (b[col] ?? 0)
            })
          }
          const limit = selectMatch[4]
          if (limit) {
            rows = rows.slice(0, parseInt(limit))
          }
          return [...rows]
        }
        return []
      },
    }
  }

  close() {}
}

describe('GuardService approval flow', () => {
  let tmpDir: string
  let dbPath: string
  let db: MockDb
  let service: GuardService
  let sendMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-approval-test-'))
    dbPath = path.join(tmpDir, 'test.db')
    db = new MockDb()

    // Bootstrap minimal schema for guard tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER);
    `)
    db.exec(`
      CREATE TABLE IF NOT EXISTS guard_runs (
        id TEXT PRIMARY KEY,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        status TEXT NOT NULL,
        total_findings INTEGER NOT NULL DEFAULT 0,
        low_count INTEGER NOT NULL DEFAULT 0,
        medium_count INTEGER NOT NULL DEFAULT 0,
        high_count INTEGER NOT NULL DEFAULT 0,
        critical_count INTEGER NOT NULL DEFAULT 0
      );
    `)
    db.exec(`
      CREATE TABLE IF NOT EXISTS guard_findings (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        source TEXT NOT NULL,
        severity TEXT NOT NULL,
        rule_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line INTEGER,
        col INTEGER,
        message TEXT NOT NULL,
        recommendation TEXT,
        snippet TEXT
      );
    `)

    // Seed a completed run with CRITICAL findings
    db.prepare(`
      INSERT INTO guard_runs (id, started_at, finished_at, status, total_findings, low_count, medium_count, high_count, critical_count)
      VALUES (?, ?, ?, 'COMPLETED', 2, 0, 0, 0, 2)
    `).run('run-001', Date.now() - 10000, Date.now() - 5000)

    // Seed two critical findings
    db.prepare(`
      INSERT INTO guard_findings (id, run_id, source, severity, rule_id, file_path, message)
      VALUES (?, ?, 'semgrep', 'CRITICAL', 'rule-1', 'src/app.ts', 'Hardcoded secret')
    `).run('finding-001', 'run-001')
    db.prepare(`
      INSERT INTO guard_findings (id, run_id, source, severity, rule_id, file_path, message)
      VALUES (?, ?, 'trufflehog', 'CRITICAL', 'rule-2', 'src/config.ts', 'API key leaked')
    `).run('finding-002', 'run-001')

    // Mock WindowManager push
    sendMock = vi.fn()
    const mockWin = {
      webContents: { send: sendMock },
      isDestroyed: () => false,
      on: vi.fn(() => mockWin),
      once: vi.fn(() => mockWin),
    } as any
    WindowManager.getInstance().register('main', mockWin)

    // Bootstrap service
    ServiceRegistry.getInstance().register(SERVICE_TOKENS.DB, { getDb: () => db })
    service = new GuardService()
    service.init()
  })

  afterEach(() => {
    db.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    ServiceRegistry.getInstance().clear()
    vi.clearAllMocks()
  })

  it('blocks runGuard when policy has CRITICAL and pending approval is rejected', async () => {
    // Policy already defaults to blockOn: ['CRITICAL']
    const runPromise = service.runGuard()

    // Wait for the approval request to be pushed
    await new Promise((r) => setTimeout(r, 50))

    expect(sendMock).toHaveBeenCalledWith(
      'guard:requestApproval',
      expect.objectContaining({
        action: 'Run Guard scan',
        severity: 'CRITICAL',
      })
    )

    const payload = sendMock.mock.calls.find(
      (call) => call[0] === 'guard:requestApproval'
    )[1]

    // Reject the approval
    service.resolveApproval(payload.requestId, false)

    await expect(runPromise).rejects.toThrow('rejected by guard approval')
  })

  it('allows runGuard when pending approval is approved', async () => {
    const runPromise = service.runGuard()

    // Wait for the approval request to be pushed
    await new Promise((r) => setTimeout(r, 50))

    expect(sendMock).toHaveBeenCalledWith(
      'guard:requestApproval',
      expect.objectContaining({
        action: 'Run Guard scan',
        severity: 'CRITICAL',
      })
    )

    const payload = sendMock.mock.calls.find(
      (call) => call[0] === 'guard:requestApproval'
    )[1]

    // Approve the action
    service.resolveApproval(payload.requestId, true)

    const result = await runPromise
    expect(result).toHaveProperty('runId')
    expect(result.runId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('does not block when policy does not include CRITICAL', async () => {
    service.setPolicy({ blockOn: ['HIGH'] })

    // Should not request approval; runGuard proceeds immediately
    const result = await service.runGuard()
    expect(result).toHaveProperty('runId')
    expect(sendMock).not.toHaveBeenCalledWith(
      'guard:requestApproval',
      expect.anything()
    )
  })

  it('does not block when no completed runs exist', async () => {
    // Delete all runs
    db.prepare("DELETE FROM guard_findings").run()
    db.prepare("DELETE FROM guard_runs").run()

    const result = await service.runGuard()
    expect(result).toHaveProperty('runId')
    expect(sendMock).not.toHaveBeenCalledWith(
      'guard:requestApproval',
      expect.anything()
    )
  })
})
