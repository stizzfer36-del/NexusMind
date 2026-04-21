export interface WorkflowDAG {
  id: string
  nodes: Array<{ id: string; type: string; data?: unknown }>
  edges: Array<{ from: string; to: string; condition?: string }>
}

export type SwarmNodeId =
  | 'coordinator'
  | 'builder'
  | 'reviewer'
  | 'tester'
  | 'docwriter'
  | 'END'

export interface SwarmGraphSnapshot {
  sessionId: string
  currentNode: SwarmNodeId
  round: number
  reviewPassed: boolean
  testPassed: boolean
  taskCount: number
  completedCount: number
  timestamp: number
}

export interface GraphTransition {
  from: SwarmNodeId
  to: SwarmNodeId
  reason: string
  timestamp: number
}
