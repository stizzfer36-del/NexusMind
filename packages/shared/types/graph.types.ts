export type WorkflowNodeType =
  | 'agent'
  | 'tool'
  | 'condition'
  | 'start'
  | 'end'

export interface WorkflowNode {
  id: string
  type: WorkflowNodeType
  label: string
  position: { x: number; y: number }
  config?: Record<string, unknown>
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  label?: string
  condition?: string
}

export interface WorkflowDAG {
  id: string
  name: string
  description?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  createdAt: number
  updatedAt: number
}

export interface WorkflowRunRequest {
  dagId: string
  input?: string
}

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  dag: WorkflowDAG
}

// ─── Swarm graph types (used by SwarmGraph.ts / SwarmService.ts) ─────────────

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
