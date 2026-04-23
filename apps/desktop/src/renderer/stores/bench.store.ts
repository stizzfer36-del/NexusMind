import { create } from 'zustand'
import { persist } from './persist'
import type { BenchTask, BenchDimension, BenchRunResult } from '@nexusmind/shared'

export type DimensionFilter = 'all' | BenchDimension

interface BenchState {
  tasks: BenchTask[]
  runs: BenchRunResult[]
  selectedDimension: DimensionFilter
  selectedModelId: string | null
  selectedProvider: string | null
  isRunning: boolean
  lastError: string | null

  setTasks: (tasks: BenchTask[]) => void
  setRuns: (runs: BenchRunResult[]) => void
  setSelectedDimension: (dim: DimensionFilter) => void
  setSelectedModel: (modelId: string, provider: string) => void
  setIsRunning: (v: boolean) => void
  setLastError: (e: string | null) => void
  clearError: () => void
}

export const useBenchStore = create<BenchState>(
  persist(
    (set) => ({
      tasks: [],
      runs: [],
      selectedDimension: 'all',
      selectedModelId: null,
      selectedProvider: null,
      isRunning: false,
      lastError: null,

      setTasks: (tasks) => set({ tasks }),
      setRuns: (runs) => set({ runs }),
      setSelectedDimension: (selectedDimension) => set({ selectedDimension }),
      setSelectedModel: (selectedModelId, selectedProvider) => set({ selectedModelId, selectedProvider }),
      setIsRunning: (isRunning) => set({ isRunning }),
      setLastError: (lastError) => set({ lastError }),
      clearError: () => set({ lastError: null }),
    }),
    { name: 'bench-store' }
  )
)
