import { useState, useCallback } from 'react'
import type { GuardFinding, GuardRun, GuardPolicy, SecurityScore, GuardTrendPoint, FixSuggestion } from '@nexusmind/shared'

export function useGuardStore() {
  const [runs, setRuns] = useState<GuardRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [findings, setFindings] = useState<GuardFinding[]>([])
  const [policy, setPolicy] = useState<GuardPolicy | null>(null)
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [securityScore, setSecurityScore] = useState<SecurityScore | null>(null)
  const [trends, setTrends] = useState<GuardTrendPoint[]>([])
  const [fixSuggestion, setFixSuggestion] = useState<FixSuggestion | null>(null)
  const [fixLoading, setFixLoading] = useState(false)
  const [hookInstalled, setHookInstalled] = useState(false)
  const [saveScanEnabled, setSaveScanEnabled] = useState(false)

  const clearError = useCallback(() => setError(undefined), [])

  return {
    runs,
    selectedRunId,
    findings,
    policy,
    running,
    loading,
    error,
    securityScore,
    trends,
    fixSuggestion,
    fixLoading,
    hookInstalled,
    saveScanEnabled,
    setRuns,
    setSelectedRunId,
    setFindings,
    setPolicy,
    setRunning,
    setLoading,
    setError,
    clearError,
    setSecurityScore,
    setTrends,
    setFixSuggestion,
    setFixLoading,
    setHookInstalled,
    setSaveScanEnabled,
  }
}