export type GuardSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type GuardSource = 'semgrep' | 'npm-audit' | 'trufflehog'

export interface GuardFinding {
  id: string
  runId: string
  source: GuardSource
  severity: GuardSeverity
  ruleId: string
  filePath: string
  line?: number
  column?: number
  message: string
  recommendation?: string
  snippet?: string
}

export interface GuardRun {
  id: string
  startedAt: number
  finishedAt: number
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  summary: {
    totalFindings: number
    bySeverity: Record<GuardSeverity, number>
  }
}

export interface GuardPolicy {
  blockOn: GuardSeverity[]
}
