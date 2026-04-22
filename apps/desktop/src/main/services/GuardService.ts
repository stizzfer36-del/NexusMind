import crypto from 'crypto'
import { execSync } from 'child_process'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import type { GuardFinding, GuardRun, GuardPolicy, GuardSeverity } from '@nexusmind/shared'
import { runSemgrepScan, runNpmAudit, runSecretsScan } from './GuardScanners.js'
import { WindowManager } from '../windows/WindowManager.js'

function isOnPath(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Scanner timed out')), ms)
    ),
  ])
}

interface PendingApproval {
  resolve: (approved: boolean) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class GuardService {
  private policy: GuardPolicy = { blockOn: ['CRITICAL'] }
  private readonly pendingApprovals = new Map<string, PendingApproval>()

  private get db() {
    return (ServiceRegistry.getInstance().resolve(SERVICE_TOKENS.DB) as any).getDb()
  }

  init(): void {
    ServiceRegistry.getInstance().register(SERVICE_TOKENS.GuardService, this)
    // Load persisted policy if any
    const row = this.db.prepare(`SELECT value FROM settings WHERE key = 'guardPolicy'`).get() as { value: string } | undefined
    if (row) {
      try { this.policy = JSON.parse(row.value) } catch {}
    }
  }

  getPolicy(): GuardPolicy {
    return this.policy
  }

  setPolicy(policy: GuardPolicy): void {
    this.policy = policy
    this.db.prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`).run('guardPolicy', JSON.stringify(policy), Date.now())
  }

  private push(channel: string, payload: unknown): void {
    WindowManager.getInstance().get('main')?.webContents.send(channel, payload)
  }

  private async requestApproval(action: string, reason: string, severity: GuardSeverity): Promise<boolean> {
    const requestId = crypto.randomUUID()

    return new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingApprovals.delete(requestId)
        reject(new Error('Approval request timed out'))
      }, 60000)

      this.pendingApprovals.set(requestId, { resolve, reject, timer })
      this.push('guard:requestApproval', { requestId, action, reason, severity })
    })
  }

  resolveApproval(requestId: string, approved: boolean): void {
    const pending = this.pendingApprovals.get(requestId)
    if (!pending) {
      console.warn(`[GuardService] No pending approval for requestId=${requestId}`)
      return
    }
    clearTimeout(pending.timer)
    this.pendingApprovals.delete(requestId)
    pending.resolve(approved)
  }

  private async checkApprovalForAction(action: string): Promise<void> {
    // If policy does not block on anything, no approval needed.
    if (this.policy.blockOn.length === 0) return

    // Check the latest completed run for blocking severities.
    const latestRun = this.db.prepare(`
      SELECT * FROM guard_runs WHERE status = 'COMPLETED' ORDER BY started_at DESC LIMIT 1
    `).get() as any

    if (!latestRun) return

    const severityCounts: Record<GuardSeverity, number> = {
      LOW: latestRun.low_count ?? 0,
      MEDIUM: latestRun.medium_count ?? 0,
      HIGH: latestRun.high_count ?? 0,
      CRITICAL: latestRun.critical_count ?? 0,
    }

    const blockingSeverities = this.policy.blockOn.filter(
      (sev: GuardSeverity) => severityCounts[sev] > 0
    )

    if (blockingSeverities.length === 0) return

    const highestSeverity = blockingSeverities.includes('CRITICAL')
      ? 'CRITICAL'
      : blockingSeverities.includes('HIGH')
        ? 'HIGH'
        : blockingSeverities.includes('MEDIUM')
          ? 'MEDIUM'
          : 'LOW'

    const totalBlocking = blockingSeverities.reduce(
      (sum, sev) => sum + severityCounts[sev],
      0
    )

    const approved = await this.requestApproval(
      action,
      `${totalBlocking} ${blockingSeverities.join('/')} finding(s) detected in the latest scan. Review before proceeding.`,
      highestSeverity as GuardSeverity
    )

    if (!approved) {
      throw new Error(`Action "${action}" rejected by guard approval.`)
    }
  }

  async runGuard(): Promise<{ runId: string }> {
    // Guard-run itself can be blocked by existing critical findings.
    await this.checkApprovalForAction('Run Guard scan')

    const runId = crypto.randomUUID()
    const startedAt = Date.now()

    this.db.prepare(`
      INSERT INTO guard_runs (id, started_at, status, total_findings, low_count, medium_count, high_count, critical_count)
      VALUES (?, ?, 'RUNNING', 0, 0, 0, 0, 0)
    `).run(runId, startedAt)

    const scannerDefs = [
      { key: 'semgrep', cmd: 'semgrep', run: () => runSemgrepScan(runId) },
      { key: 'npm-audit', cmd: 'npm', run: () => runNpmAudit(runId) },
      { key: 'trufflehog', cmd: 'trufflehog', run: () => runSecretsScan(runId) },
    ]

    const allFindings: GuardFinding[] = []
    const scannerStatus: Record<string, string> = {}

    for (const def of scannerDefs) {
      const available = isOnPath(def.cmd)
      if (!available) {
        scannerStatus[def.key] = 'not-installed'
        this.push('guard:progress', { scanner: def.key, status: 'not-installed', findings: [] })
        continue
      }

      try {
        const result = await withTimeout(def.run(), 30000)
        scannerStatus[def.key] = 'completed'
        const findings = result.findings ?? []
        allFindings.push(...findings)
        this.push('guard:progress', { scanner: def.key, status: 'completed', findings })
      } catch (err) {
        scannerStatus[def.key] = 'failed'
        this.push('guard:progress', { scanner: def.key, status: 'failed', findings: [] })
      }
    }

    const insertFinding = this.db.prepare(`
      INSERT INTO guard_findings (id, run_id, source, severity, rule_id, file_path, line, col, message, recommendation, snippet)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const f of allFindings) {
      insertFinding.run(f.id, f.runId, f.source, f.severity, f.ruleId, f.filePath, f.line ?? null, f.column ?? null, f.message, f.recommendation ?? null, f.snippet ?? null)
    }

    const counts: Record<GuardSeverity, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 }
    for (const f of allFindings) counts[f.severity] = (counts[f.severity] ?? 0) + 1

    this.db.prepare(`
      UPDATE guard_runs SET status = 'COMPLETED', finished_at = ?, total_findings = ?, low_count = ?, medium_count = ?, high_count = ?, critical_count = ?
      WHERE id = ?
    `).run(Date.now(), allFindings.length, counts.LOW, counts.MEDIUM, counts.HIGH, counts.CRITICAL, runId)

    this.push('guard:complete', { runId, findings: allFindings })

    return { runId }
  }

  getRun(runId: string): GuardRun | null {
    const row = this.db.prepare(`SELECT * FROM guard_runs WHERE id = ?`).get(runId) as any
    if (!row) return null
    return this._rowToRun(row)
  }

  listRuns(): GuardRun[] {
    const rows = this.db.prepare(`SELECT * FROM guard_runs ORDER BY started_at DESC`).all() as any[]
    return rows.map(r => this._rowToRun(r))
  }

  getFindings(runId: string): GuardFinding[] {
    const rows = this.db.prepare(`SELECT * FROM guard_findings WHERE run_id = ?`).all(runId) as any[]
    return rows.map(r => ({
      id: r.id,
      runId: r.run_id,
      source: r.source,
      severity: r.severity as GuardSeverity,
      ruleId: r.rule_id,
      filePath: r.file_path,
      line: r.line ?? undefined,
      column: r.col ?? undefined,
      message: r.message,
      recommendation: r.recommendation ?? undefined,
      snippet: r.snippet ?? undefined,
    } as GuardFinding))
  }

  private _rowToRun(r: any): GuardRun {
    return {
      id: r.id,
      startedAt: r.started_at,
      finishedAt: r.finished_at ?? Date.now(),
      status: r.status,
      summary: {
        totalFindings: r.total_findings,
        bySeverity: {
          LOW: r.low_count,
          MEDIUM: r.medium_count,
          HIGH: r.high_count,
          CRITICAL: r.critical_count,
        },
      },
    }
  }

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'guard:run': async (_event: any) => this.runGuard(),
      'guard:getRun': (_event: any, runId: string) => this.getRun(runId),
      'guard:listRuns': (_event: any) => this.listRuns(),
      'guard:getFindings': (_event: any, runId: string) => this.getFindings(runId),
      'guard:getPolicy': (_event: any) => this.getPolicy(),
      'guard:setPolicy': (_event: any, policy: GuardPolicy) => this.setPolicy(policy),
      'guard:approvalResponse': (_event: any, payload: { requestId: string; approved: boolean }) =>
        this.resolveApproval(payload.requestId, payload.approved),
    }
  }
}
