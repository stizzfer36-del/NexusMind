import { execSync } from 'child_process'
import crypto from 'crypto'
import type { GuardFinding, GuardSeverity, GuardSource } from '@nexusmind/shared'

export interface ScannerResult {
  findings: GuardFinding[]
  errors?: string[]
}

function makeFinding(runId: string, source: GuardSource, severity: GuardSeverity, ruleId: string, filePath: string, message: string, opts?: Partial<GuardFinding>): GuardFinding {
  return {
    id: crypto.randomUUID(),
    runId,
    source,
    severity,
    ruleId,
    filePath,
    message,
    ...opts,
  }
}

function mapNpmSeverity(s: string): GuardSeverity {
  if (s === 'critical') return 'CRITICAL'
  if (s === 'high') return 'HIGH'
  if (s === 'moderate' || s === 'medium') return 'MEDIUM'
  return 'LOW'
}

function mapSemgrepSeverity(s: string): GuardSeverity {
  if (s === 'ERROR') return 'HIGH'
  if (s === 'WARNING') return 'MEDIUM'
  if (s === 'INFO') return 'LOW'
  return 'LOW'
}

export async function runSemgrepScan(runId: string): Promise<ScannerResult> {
  try {
    const out = execSync('semgrep --config=auto --json --quiet .', {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const parsed = JSON.parse(out)
    const results: any[] = parsed.results ?? []
    const findings: GuardFinding[] = results.map(r =>
      makeFinding(runId, 'semgrep', mapSemgrepSeverity(r.extra?.severity ?? ''), r.check_id ?? 'semgrep-rule', r.path ?? '', r.extra?.message ?? r.check_id ?? 'Semgrep finding', {
        line: r.start?.line,
        column: r.start?.col,
        snippet: r.extra?.lines,
        recommendation: r.extra?.fix ?? undefined,
      })
    )
    return { findings }
  } catch (err: any) {
    if (err?.status !== undefined || err?.code === 'ENOENT') {
      return {
        findings: [makeFinding(runId, 'semgrep', 'MEDIUM', 'scanner-unavailable', '', 'semgrep is not installed or could not run. Install with: pip install semgrep', { recommendation: 'pip install semgrep' })],
        errors: [String(err?.message ?? err)],
      }
    }
    // semgrep exits 1 when findings exist — try to parse stdout anyway
    try {
      const stdout = err?.stdout ?? ''
      const parsed = JSON.parse(stdout)
      const results: any[] = parsed.results ?? []
      const findings: GuardFinding[] = results.map(r =>
        makeFinding(runId, 'semgrep', mapSemgrepSeverity(r.extra?.severity ?? ''), r.check_id ?? 'semgrep-rule', r.path ?? '', r.extra?.message ?? r.check_id ?? 'Semgrep finding', {
          line: r.start?.line,
          column: r.start?.col,
          snippet: r.extra?.lines,
        })
      )
      return { findings }
    } catch {
      return { findings: [], errors: [String(err?.message ?? err)] }
    }
  }
}

export async function runNpmAudit(runId: string): Promise<ScannerResult> {
  try {
    const out = execSync('npm audit --json', {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return parseNpmAuditOutput(runId, out)
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return {
        findings: [makeFinding(runId, 'npm-audit', 'MEDIUM', 'scanner-unavailable', 'package.json', 'npm is not available in PATH')],
        errors: [String(err.message)],
      }
    }
    // npm audit exits non-zero when vulnerabilities found
    try {
      return parseNpmAuditOutput(runId, err?.stdout ?? '')
    } catch {
      return { findings: [], errors: [String(err?.message ?? err)] }
    }
  }
}

function parseNpmAuditOutput(runId: string, out: string): ScannerResult {
  const parsed = JSON.parse(out)
  const findings: GuardFinding[] = []
  const vulns: Record<string, any> = parsed.vulnerabilities ?? {}
  for (const [name, vuln] of Object.entries(vulns)) {
    const v = vuln as any
    if (!v.isDirect && v.via?.length && typeof v.via[0] === 'object') {
      const via = v.via[0] as any
      findings.push(makeFinding(runId, 'npm-audit', mapNpmSeverity(v.severity ?? ''), via.cwe?.[0] ?? 'npm-advisory', `node_modules/${name}`, via.title ?? `Vulnerability in ${name}`, {
        recommendation: `Run: npm audit fix`,
        snippet: via.url,
      }))
    } else if (v.isDirect) {
      findings.push(makeFinding(runId, 'npm-audit', mapNpmSeverity(v.severity ?? ''), 'npm-advisory', 'package.json', `Dependency ${name} has a ${v.severity} vulnerability`, {
        recommendation: `Run: npm audit fix`,
      }))
    }
  }
  return { findings }
}

const SECRET_PATTERNS = [
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["']?([A-Za-z0-9\-_]{20,})["']?/gi, ruleId: 'secret/api-key' },
  { pattern: /(?:secret|token|password|passwd|pwd)\s*[:=]\s*["']?([A-Za-z0-9\-_+/]{16,})["']?/gi, ruleId: 'secret/generic-secret' },
  { pattern: /sk-[A-Za-z0-9]{40,}/g, ruleId: 'secret/openai-key' },
  { pattern: /AKIA[0-9A-Z]{16}/g, ruleId: 'secret/aws-access-key' },
  { pattern: /ghp_[A-Za-z0-9]{36}/g, ruleId: 'secret/github-token' },
  { pattern: /AIza[0-9A-Za-z\-_]{35}/g, ruleId: 'secret/google-api-key' },
]

export async function runSecretsScan(runId: string): Promise<ScannerResult> {
  try {
    const out = execSync('git ls-files', {
      timeout: 10000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const files = out.trim().split('\n').filter(f => f && !f.includes('node_modules') && !f.endsWith('.lock'))
    const findings: GuardFinding[] = []

    for (const filePath of files.slice(0, 500)) {
      try {
        const content = execSync(`cat "${filePath}"`, { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 }) as string
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          for (const { pattern, ruleId } of SECRET_PATTERNS) {
            pattern.lastIndex = 0
            if (pattern.test(lines[i])) {
              findings.push(makeFinding(runId, 'trufflehog', 'CRITICAL', ruleId, filePath, `Potential secret detected (${ruleId})`, {
                line: i + 1,
                snippet: lines[i].replace(/["']([A-Za-z0-9\-_+/]{8})[A-Za-z0-9\-_+/]+["']?/g, '"$1***"'),
                recommendation: 'Remove the secret and rotate it immediately. Add to .gitignore.',
              }))
            }
          }
        }
      } catch {}
    }

    return { findings }
  } catch (err: any) {
    // Fall back: not a git repo or git not available
    return { findings: [], errors: [String(err?.message ?? err)] }
  }
}
