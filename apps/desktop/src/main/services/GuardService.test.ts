import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
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

describe('GuardService approval flow', () => {
  let tmpDir: string
  let dbPath: string
  let db: Database.Database
  let service: GuardService
  let sendMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-approval-test-'))
    dbPath = path.join(tmpDir, 'test.db')
    db = new Database(dbPath)

    // Bootstrap minimal schema for guard tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER);
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
