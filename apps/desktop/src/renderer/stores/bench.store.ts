import { useState, useCallback } from 'react'
import type { BenchTask, BenchDimension, BenchRunResult } from '@nexusmind/shared'

export type DimensionFilter = 'all' | BenchDimension

export function useBenchStore() {
  const [tasks, setTasks] = useState<BenchTask[]>([])
  const [runs, setRuns] = useState<BenchRunResult[]>([])
  const [selectedDimension, setSelectedDimension] = useState<DimensionFilter>('all')
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  const setSelectedModel = useCallback((modelId: string, provider: string) => {
    setSelectedModelId(modelId)
    setSelectedProvider(provider)
  }, [])

  const clearError = useCallback(() => setLastError(null), [])

  return {
    tasks,
    runs,
    selectedDimension,
    selectedModelId,
    selectedProvider,
    isRunning,
    lastError,
    setTasks,
    setRuns,
    setSelectedDimension,
    setSelectedModel,
    setIsRunning: (v: boolean) => setIsRunning(v),
    setLastError: (e: string | null) => setLastError(e),
    clearError,
  }
}
