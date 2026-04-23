import crypto from 'crypto'
import { execSync } from 'child_process'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import type { GuardFinding, GuardRun, GuardPolicy, GuardSeverity, SecurityScore, GuardTrendPoint, SarifReport, SarifRun, SarifResult, SarifRule, FixSuggestion, PreCommitResult } from '@nexusmind/shared'
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

const SEV_SARIF_LEVEL: Record<GuardSeverity, 'error' | 'warning' | 'note' | 'none'> = {
  CRITICAL: 'error',
  HIGH: 'error',
  MEDIUM: 'warning',
  LOW: 'note',
}

export class GuardService {
  private policy: GuardPolicy = { blockOn: ['CRITICAL'] }
  private readonly pendingApprovals = new Map<string, PendingApproval>()

  private get db() {
    return (ServiceRegistry.getInstance().resolve(SERVICE_TOKENS.DB) as any).getDb()
  }

  init(): void {
    ServiceRegistry.getInstance().register(SERVICE_TOKENS.GuardService, this)
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

  async runGuard(): Promise<GuardRun> {
    const runId = crypto.randomUUID()
    const now = Date.now()

    this.db.prepare(`
      INSERT INTO guard_runs (id, started_at, status, total_findings, low_count, medium_count, high_count, critical_count)
      VALUES (?, ?, 'RUNNING', 0, 0, 0, 0, 0)
    `).run(runId, now)

    this.push('guard:status', { runId, status: 'RUNNING' })

    const findings: GuardFinding[] = []

    try {
      if (isOnPath('semgrep')) {
        const result = await withTimeout(runSemgrepScan(runId), 120000)
        findings.push(...result.findings)
      }

      if (isOnPath('npm')) {
        const result = await withTimeout(runNpmAudit(runId), 120000)
        findings.push(...result.findings)
      }

      if (isOnPath('trufflehog') || isOnPath('git')) {
        const result = await withTimeout(runSecretsScan(runId), 120000)
        findings.push(...result.findings)
      }

      const bySeverity = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 }
      for (const f of findings) bySeverity[f.severity]++

      const insert = this.db.prepare(`
        INSERT INTO guard_findings
        (id, run_id, source, severity, rule_id, file_path, line, col, message, recommendation, snippet)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      for (const f of findings) {
        insert.run(
          f.id,
          runId,
          f.source,
          f.severity,
          f.ruleId,
          f.filePath,
          f.line ?? null,
          f.column ?? null,
          f.message,
          f.recommendation ?? null,
          f.snippet ?? null
        )
      }

      this.db.prepare(`
        UPDATE guard_runs
        SET status = 'COMPLETED',
            finished_at = ?,
            total_findings = ?,
            low_count = ?,
            medium_count = ?,
            high_count = ?,
            critical_count = ?
        WHERE id = ?
      `).run(
        Date.now(),
        findings.length,
        bySeverity.LOW,
        bySeverity.MEDIUM,
        bySeverity.HIGH,
        bySeverity.CRITICAL,
        runId
      )

      const run = this.getRun(runId)!
      this.push('guard:completed', run)
      return run
    } catch (err) {
      this.db.prepare(`UPDATE guard_runs SET status = 'FAILED', finished_at = ? WHERE id = ?`).run(Date.now(), runId)
      this.push('guard:failed', { runId, error: String(err) })
      throw err
    }
  }

  getRun(runId: string): GuardRun | null {
    const row = this.db.prepare(`SELECT * FROM guard_runs WHERE id = ?`).get(runId) as any
    if (!row) return null
    return this._rowToRun(row)
  }

  listRuns(limit = 20): GuardRun[] {
    const rows = this.db.prepare(`
      SELECT * FROM guard_runs ORDER BY started_at DESC LIMIT ?
    `).all(limit) as any[]
    return rows.map(r => this._rowToRun(r))
  }

  getFindings(runId: string): GuardFinding[] {
    const rows = this.db.prepare(`
      SELECT * FROM guard_findings WHERE run_id = ? ORDER BY
        CASE severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          ELSE 4
        END,
        file_path
    `).all(runId) as any[]

    return rows.map(r => ({
      id: r.id,
      runId: r.run_id,
      source: r.source,
      severity: r.severity,
      ruleId: r.rule_id,
      filePath: r.file_path,
      line: r.line ?? undefined,
      column: r.col ?? undefined,
      message: r.message,
      recommendation: r.recommendation ?? undefined,
      snippet: r.snippet ?? undefined,
    }))
  }

  getSecurityScore(): SecurityScore {
    const runs = this.listRuns(30)
    if (runs.length === 0) {
      return {
        score: 100,
        grade: 'A+',
        totalFindings: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        trend: 'stable'
      }
    }

    const latest = runs[0]
    const totalFindings = latest.summary.totalFindings
    const criticalCount = latest.summary.bySeverity.CRITICAL
    const highCount = latest.summary.bySeverity.HIGH
    const mediumCount = latest.summary.bySeverity.MEDIUM
    const lowCount = latest.summary.bySeverity.LOW

    let score = 100
    score -= criticalCount * 15
    score -= highCount * 7
    score -= mediumCount * 3
    score -= lowCount * 1
    score = Math.max(0, score)

    let grade: SecurityScore['grade']
    if (score >= 95) grade = 'A+'
    else if (score >= 90) grade = 'A'
    else if (score >= 80) grade = 'B'
    else if (score >= 70) grade = 'C'
    else if (score >= 60) grade = 'D'
    else grade = 'F'

    const prevRun = runs[1]
    let trend: SecurityScore['trend'] = 'stable'
    if (prevRun) {
      const prevScore = 100 - (prevRun.summary.bySeverity.CRITICAL * 15 + prevRun.summary.bySeverity.HIGH * 7 + prevRun.summary.bySeverity.MEDIUM * 3 + prevRun.summary.bySeverity.LOW * 1)
      if (score > prevScore + 5) trend = 'improving'
      else if (score < prevScore - 5) trend = 'declining'
    }

    return {
      score,
      grade,
      totalFindings,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      trend
    }
  }

  getTrends(days = 30): GuardTrendPoint[] {
    const since = Date.now() - days * 24 * 60 * 60 * 1000
    const rows = this.db.prepare(`
      SELECT id, started_at, total_findings, critical_count, high_count, medium_count, low_count
      FROM guard_runs
      WHERE status = 'COMPLETED' AND started_at >= ?
      ORDER BY started_at DESC
    `).all(since) as any[]

    return rows.map(r => ({
      runId: r.id,
      timestamp: r.started_at,
      total: r.total_findings,
      critical: r.critical_count,
      high: r.high_count,
      medium: r.medium_count,
      low: r.low_count,
    }))
  }

  exportSarif(runId?: string): SarifReport {
    const findings = runId
      ? this.getFindings(runId)
      : (() => {
          const latestRun = this.db.prepare(`SELECT id FROM guard_runs WHERE status = 'COMPLETED' ORDER BY started_at DESC LIMIT 1`).get() as any
          return latestRun ? this.getFindings(latestRun.id) : []
        })()

    const rulesMap = new Map<string, SarifRule>()
    const results: SarifResult[] = []

    for (const f of findings) {
      if (!rulesMap.has(f.ruleId)) {
        rulesMap.set(f.ruleId, {
          id: f.ruleId,
          shortDescription: { text: f.message },
          helpUri: f.source === 'semgrep' ? `https://semgrep.dev/p/${f.ruleId}` : undefined,
        })
      }

      results.push({
        ruleId: f.ruleId,
        level: SEV_SARIF_LEVEL[f.severity],
        message: { text: f.message },
        locations: [{
          physicalLocation: {
            artifactLocation: { uri: f.filePath },
            region: {
              startLine: f.line ?? 1,
              ...(f.column ? { startColumn: f.column } : {}),
            },
          },
        }],
      })
    }

    const runs: SarifRun[] = [{
      tool: {
        driver: {
          name: 'NexusGuard',
          version: '1.0.0',
          informationUri: 'https://nexusmind.ai/guard',
          rules: Array.from(rulesMap.values()),
        },
      },
      results,
    }]

    return {
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
      version: '2.1.0',
      runs,
    }
  }

  async getFixSuggestion(findingId: string): Promise<FixSuggestion | null> {
    const row = this.db.prepare(`SELECT * FROM guard_findings WHERE id = ?`).get(findingId) as any
    if (!row) return null

    const ruleId = (row.rule_id as string).toLowerCase()
    let confidence: FixSuggestion['confidence'] = 'medium'
    let suggestedFix = ''
    let explanation = ''

    if (ruleId.includes('secret') || ruleId.includes('api-key') || ruleId.includes('token')) {
      confidence = 'high'
      suggestedFix = row.snippet
        ? String(row.snippet).replace(/["']([A-Za-z0-9\-_+/]{8})[A-Za-z0-9\-_+/]+["']/g, '"$1***REDACTED***"')
        : '// TODO: Move secret to environment variable\nconst SECRET = process.env.SECRET_KEY;'
      explanation = 'This finding contains a hardcoded secret. Move it to an environment variable or a secrets manager.'
    } else if (ruleId.includes('npm-advisory') || ruleId.includes('vuln')) {
      confidence = 'high'
      suggestedFix = '// Run: npm audit fix\n// Or update the specific dependency'
      explanation = 'This dependency has a known vulnerability. Run `npm audit fix` to apply available patches.'
    } else if (ruleId.includes('xss') || ruleId.includes('inject')) {
      confidence = 'medium'
      suggestedFix = '// Sanitize user input before rendering\nconst sanitized = DOMPurify.sanitize(userInput);'
      explanation = 'This code may be vulnerable to injection attacks. Always sanitize user input.'
    } else {
      confidence = 'low'
      suggestedFix = row.recommendation ?? '// Review the finding and apply best practices'
      explanation = row.message
    }

    return {
      findingId: row.id,
      filePath: row.file_path,
      line: row.line ?? undefined,
      originalSnippet: row.snippet ?? '',
      suggestedFix,
      explanation,
      confidence
    }
  }

  async scanFile(filePath: string): Promise<GuardFinding[]> {
    const runId = `file-scan-${crypto.randomUUID()}`
    const findings: GuardFinding[] = []

    try {
      const fs = require('fs')
      const content = fs.readFileSync(filePath, 'utf-8')
      const lines = content.split('\n')

      const SECRET_PATTERNS = [
        { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["']?([A-Za-z0-9\-_]{20,})["']?/gi, ruleId: 'secret/api-key' },
        { pattern: /(?:secret|token|password|passwd|pwd)\s*[:=]\s*["']?([A-Za-z0-9\-_+/]{16,})["']?/gi, ruleId: 'secret/generic-secret' },
        { pattern: /sk-[A-Za-z0-9]{40,}/g, ruleId: 'secret/openai-key' },
        { pattern: /AKIA[0-9A-Z]{16}/g, ruleId: 'secret/aws-access-key' },
        { pattern: /ghp_[A-Za-z0-9]{36}/g, ruleId: 'secret/github-token' },
        { pattern: /AIza[0-9A-Za-z\-_]{35}/g, ruleId: 'secret/google-api-key' },
      ]

      for (let i = 0; i < lines.length; i++) {
        for (const { pattern, ruleId } of SECRET_PATTERNS) {
          pattern.lastIndex = 0
          if (pattern.test(lines[i])) {
            findings.push({
              id: crypto.randomUUID(),
              runId,
              source: 'trufflehog',
              severity: 'CRITICAL',
              ruleId,
              filePath,
              line: i + 1,
              message: `Potential secret detected (${ruleId})`,
              snippet: lines[i].replace(/["']([A-Za-z0-9\-_+/]{8})[A-Za-z0-9\-_+/]+["']?/g, '"$1***"'),
              recommendation: 'Remove the secret and rotate it immediately.',
            })
          }
        }
      }
    } catch {
      // File not readable or doesn't exist
    }

    this.push('guard:fileScanResult', { filePath, findings })
    return findings
  }

  async preCommitCheck(): Promise<PreCommitResult> {
    const latestRun = this.db.prepare(`
      SELECT * FROM guard_runs WHERE status = 'COMPLETED' ORDER BY started_at DESC LIMIT 1
    `).get() as any

    if (!latestRun) {
      return { allowed: true, findings: [], message: 'No scans found. Run a scan before committing.' }
    }

    const findings = this.getFindings(latestRun.id)

    const stagedFiles: string[] = []
    try {
      const output = execSync('git diff --name-only --cached', { encoding: 'utf8', cwd: process.cwd() })
      stagedFiles.push(...output.trim().split('\n').filter(Boolean))
    } catch {}

    const relevantFindings = findings.filter(f =>
      stagedFiles.some(sf => f.filePath.includes(sf) || sf.includes(f.filePath.split('/').pop() ?? ''))
    )

    const hasBlocking = this.policy.blockOn.some(sev =>
      relevantFindings.some(f => f.severity === sev)
    )

    const result: PreCommitResult = {
      allowed: !hasBlocking,
      findings: relevantFindings,
      message: hasBlocking
        ? `Commit blocked: ${relevantFindings.filter(f => this.policy.blockOn.includes(f.severity)).length} blocking finding(s) in staged files.`
        : relevantFindings.length > 0
          ? `${relevantFindings.length} finding(s) in staged files (non-blocking).`
          : 'No findings in staged files.',
    }

    this.push('guard:preCommitResult', result)
    return result
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
      'guard:getSecurityScore': (_event: any) => this.getSecurityScore(),
      'guard:getTrends': (_event: any) => this.getTrends(),
      'guard:exportSarif': (_event: any, runId?: string) => this.exportSarif(runId),
      'guard:fixSuggestion': async (_event: any, findingId: string) => this.getFixSuggestion(findingId),
      'guard:scanFile': async (_event: any, filePath: string) => this.scanFile(filePath),
      'guard:preCommitCheck': async (_event: any) => this.preCommitCheck(),
    }
  }
}
