export enum ReplayEventType {
  AGENT_START = 'agent_start',
  AGENT_END = 'agent_end',
  TASK_START = 'task_start',
  TASK_END = 'task_end',
  MESSAGE_SENT = 'message_sent',
  MESSAGE_RECEIVED = 'message_received',
  TOOL_CALL = 'tool_call',
  TOOL_RESULT = 'tool_result',
  ERROR = 'error',
  STATE_CHANGE = 'state_change'
}

export interface ReplayEvent {
  id: string
  sessionId: string
  type: ReplayEventType
  agentId?: string
  taskId?: string
  payload: Record<string, unknown>
  timestamp: number
  sequence: number
}

export interface ReplaySession {
  id: string
  name: string
  swarmSessionId: string
  events: ReplayEvent[]
  startedAt: number
  endedAt?: number
}
