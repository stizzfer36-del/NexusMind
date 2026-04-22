import { useState, useCallback } from 'react'
import type { GuardFinding, GuardRun, GuardPolicy } from '@nexusmind/shared'

export function useGuardStore() {
  const [runs, setRuns] = useState<GuardRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [findings, setFindings] = useState<GuardFinding[]>([])
  const [policy, setPolicy] = useState<GuardPolicy | null>(null)
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const clearError = useCallback(() => setError(undefined), [])

  return {
    runs,
    selectedRunId,
    findings,
    policy,
    running,
    loading,
    error,
    setRuns,
    setSelectedRunId,
    setFindings,
    setPolicy,
    setRunning,
    setLoading,
    setError,
    clearError,
  }
}
