export type NexusCommand =
  | 'run-swarm'
  | 'run-graph'
  | 'run-bench'
  | 'run-guard'
  | 'repl'

export interface SwarmRunArgs {
  goal: string
  maxAgents?: number
  maxRounds?: number
}

export interface GraphRunArgs {
  dagId: string
  input?: string
}

export interface BenchRunArgs {
  dimension?: string
  modelId?: string
  sampleSize?: number
}

export interface GuardRunArgs {
  scope?: string
}

export interface CLIResult {
  ok: boolean
  message?: string
  data?: unknown
}
