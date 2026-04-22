export type AgentId = string

export enum AgentRole {
  // LLM message roles
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
  // Agent pipeline roles
  COORDINATOR = 'coordinator',
  SCOUT = 'scout',
  BUILDER = 'builder',
  REVIEWER = 'reviewer',
  TESTER = 'tester',
  DOCWRITER = 'docwriter',
  ARCHITECT = 'architect'
}

export enum AgentStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface AgentMessage {
  id: string
  agentId: AgentId
  role: AgentRole
  content: string
  timestamp: number
  metadata?: Record<string, unknown>
}
