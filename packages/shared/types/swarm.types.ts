export enum SwarmStatus {
  IDLE = 'idle',
  ORCHESTRATING = 'orchestrating',
  EXECUTING = 'executing',
  CONVERGING = 'converging',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface SwarmConfig {
  maxAgents: number
  maxRounds: number
  consensusThreshold: number
  timeoutMs: number
  enableReflection: boolean
}

export interface SwarmState {
  status: SwarmStatus
  currentRound: number
  agentIds: string[]
  messages: string[]
  consensusReached: boolean
}

export interface SwarmSession {
  id: string
  name: string
  config: SwarmConfig
  state: SwarmState
  createdAt: number
  updatedAt: number
}
