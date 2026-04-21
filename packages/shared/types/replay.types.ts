export type ReplayEventType =
  | 'graph:transition'
  | 'agent:output'
  | 'tool:call'
  | 'tool:result'
  | 'kanban:move'
  | 'memory:store'
  | 'pty:chunk'
  | 'session:start'
  | 'session:end'

export interface ReplayEvent {
  id: string
  sessionId: string
  type: ReplayEventType
  timestamp: number
  nodeId?: string
  agentId?: string
  payload: Record<string, unknown>
  durationMs?: number
}

export interface ReplaySession {
  id: string
  name: string
  startedAt: number
  endedAt?: number
  eventCount: number
  nodeTransitions: number
  toolCallCount: number
}

export interface ReplayPlayerState {
  sessionId: string
  events: ReplayEvent[]
  currentIndex: number
  playing: boolean
  playbackSpeed: number
}
