export type LinkEventType =
  | 'pty:data'
  | 'pty:resize'
  | 'session:summary'
  | 'swarm:status'
  | 'ping'
  | 'pong'

export interface LinkEvent<T = unknown> {
  type: LinkEventType
  payload: T
}

export interface LinkSessionSummary {
  activeSwarmSessionId?: string
  activeGraphDagId?: string
  ptyTabs: { id: string; title: string }[]
}

export interface LinkConfig {
  enabled: boolean
  port: number
  token?: string
  running?: boolean
  clientCount?: number
}
