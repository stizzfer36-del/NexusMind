export enum NodeType {
  START = 'start',
  END = 'end',
  AGENT = 'agent',
  TASK = 'task',
  DECISION = 'decision',
  PARALLEL = 'parallel',
  JOIN = 'join',
  GATEWAY = 'gateway',
  TOOL = 'tool',
  DELAY = 'delay'
}

export enum EdgeType {
  SEQUENTIAL = 'sequential',
  CONDITIONAL = 'conditional',
  PARALLEL = 'parallel',
  LOOP = 'loop',
  ERROR = 'error',
  DEFAULT = 'default'
}

export interface WorkflowNode {
  id: string
  type: NodeType
  label: string
  agentId?: string
  taskId?: string
  config?: Record<string, unknown>
  position?: { x: number; y: number }
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  type: EdgeType
  condition?: string
  label?: string
}

export interface WorkflowDAG {
  id: string
  name: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  version: string
  createdAt: number
}
