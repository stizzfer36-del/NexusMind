export enum GuardSeverity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface GuardFinding {
  id: string
  ruleId: string
  severity: GuardSeverity
  filePath: string
  lineStart: number
  lineEnd: number
  message: string
  suggestion?: string
  snippet?: string
}

export interface GuardScanResult {
  id: string
  scope: string
  findings: GuardFinding[]
  scannedFiles: number
  scannedLines: number
  durationMs: number
  timestamp: number
}
