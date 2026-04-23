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

export interface SecurityScore {
  score: number
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F'
  totalFindings: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  trend: 'improving' | 'stable' | 'declining'
}

export interface GuardTrendPoint {
  runId: string
  timestamp: number
  total: number
  critical: number
  high: number
  medium: number
  low: number
}

export interface SarifReport {
  $schema: string
  version: string
  runs: SarifRun[]
}

export interface SarifRun {
  tool: {
    driver: {
      name: string
      version?: string
      informationUri?: string
      rules: SarifRule[]
    }
  }
  results: SarifResult[]
}

export interface SarifRule {
  id: string
  shortDescription?: { text: string }
  fullDescription?: { text: string }
  helpUri?: string
}

export interface SarifResult {
  ruleId: string
  level: 'note' | 'warning' | 'error' | 'none'
  message: { text: string }
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string }
      region: { startLine: number; startColumn?: number }
    }
  }>
}

export interface FixSuggestion {
  findingId: string
  filePath: string
  line?: number
  originalSnippet: string
  suggestedFix: string
  explanation: string
  confidence: 'high' | 'medium' | 'low'
}

export interface PreCommitResult {
  allowed: boolean
  findings: GuardFinding[]
  message?: string
}
