export enum BenchDimension {
  ACCURACY = 'accuracy',
  SPEED = 'speed',
  COST = 'cost',
  SAFETY = 'safety',
  COHERENCE = 'coherence',
  CORRECTNESS = 'correctness',
  ROBUSTNESS = 'robustness'
}

export interface BenchTask {
  id: string
  name: string
  prompt: string
  expectedOutput?: string
  dimensions: BenchDimension[]
  tags: string[]
  timeoutMs: number
}

export interface BenchResult {
  taskId: string
  modelId: string
  dimension: BenchDimension
  score: number
  rawOutput: string
  latencyMs: number
  tokenCount: number
  timestamp: number
}

export interface BenchReport {
  id: string
  name: string
  modelIds: string[]
  taskIds: string[]
  results: BenchResult[]
  createdAt: number
}
