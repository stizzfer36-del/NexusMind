import type { ModelProvider } from './model.types.js'

export type BenchDimension =
  | 'quality'
  | 'speed'
  | 'cost'
  | 'hallucination'
  | 'complexity'
  | 'reasoning'

export interface BenchTask {
  id: string
  dimension: BenchDimension
  name: string
  description: string
  input: string
  expectedBehavior?: string
  metadata?: Record<string, unknown>
}

export interface BenchRunConfig {
  modelId: string
  provider: ModelProvider
  maxTokens?: number
  temperature?: number
  toolMode?: 'none' | 'tools'
}

export interface BenchRunResult {
  id: string
  taskId: string
  dimension: BenchDimension
  modelId: string
  provider: ModelProvider
  startedAt: number
  endedAt: number
  durationMs: number
  promptTokens?: number
  completionTokens?: number
  costUsd?: number
  successScore: number
  notes?: string
  rawResponsePreview: string
}

export interface BenchReport {
  id: string
  runs: BenchRunResult[]
  createdAt: number
}
