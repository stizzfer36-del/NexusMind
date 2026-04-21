import type {
  AgentMessage,
  BenchDimension,
  BenchReport,
  BenchRunConfig,
  BenchRunResult,
  BenchTask,
  GuardFinding,
  GuardScanResult,
  MCPServerConfig,
  MCPServerId,
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  MemoryEntry,
  MemorySearchResult,
  MemoryType,
  ModelConfig,
  ModelId,
  ReplayEvent,
  ReplaySession,
  SwarmSession,
  SwarmState,
  Task,
  TaskColumn,
  TTSRequest,
  VoiceMode,
  WorkflowDAG,
  StreamChunk,
} from './types/index.js'

// ---------------------------------------------------------------------------
// Terminal / PTY (no domain types in ./types yet)
// ---------------------------------------------------------------------------
interface TerminalSession {
  id: string
  pid: number
  shell: string
}

interface TerminalResize {
  id: string
  cols: number
  rows: number
}

interface TerminalData {
  id: string
  data: string
}

// ---------------------------------------------------------------------------
// Renderer → Main   (request / response)
// ---------------------------------------------------------------------------
export interface IpcEvents {
  // terminal / pty
  'terminal:spawn': (shell?: string) => TerminalSession
  'terminal:write': (payload: TerminalData) => void
  'terminal:resize': (payload: TerminalResize) => void
  'terminal:kill': (id: string) => void

  // swarm
  'swarm:listSessions': () => SwarmSession[]
  'swarm:start': (config: SwarmSession) => SwarmSession
  'swarm:stop': (sessionId: string) => void
  'swarm:getState': (sessionId: string) => SwarmState

  // kanban / tasks
  'kanban:listTasks': () => Task[]
  'kanban:createTask': (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Task
  'kanban:updateTask': (task: Task) => Task
  'kanban:deleteTask': (taskId: string) => void
  'kanban:moveTask': (payload: { taskId: string; column: TaskColumn }) => Task

  // models
  'models:list': () => ModelConfig[]
  'models:getConfig': (modelId: ModelId) => ModelConfig
  'models:streamChat': (payload: { modelId: ModelId; messages: Array<{ role: string; content: string }> }) => AsyncIterable<StreamChunk>
  'model:validate': (provider: string) => boolean

  // settings
  'settings:get': (key: string) => unknown
  'settings:set': (payload: { key: string; value: unknown }) => void

  // keychain
  'keychain:set': (provider: string, key: string) => void
  'keychain:get': (provider: string) => string | null
  'keychain:delete': (provider: string) => void
  'keychain:list': () => string[]

  // mcp
  'mcp:listTools': (serverId: MCPServerId) => MCPTool[]
  'mcp:callTool': (call: MCPToolCall) => MCPToolResult
  'mcp:addServer': (config: MCPServerConfig) => MCPServerConfig
  'mcp:removeServer': (serverId: MCPServerId) => void
  'mcp:executeTool': (payload: { name: string; args: Record<string, unknown> }) => unknown

  // memory
  'memory:search': (payload: { query: string; type?: MemoryType }) => MemorySearchResult[]
  'memory:add': (entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'accessedAt'>) => MemoryEntry
  'memory:delete': (id: string) => void

  // voice
  'voice:start': (mode: VoiceMode) => void
  'voice:stop': () => void
  'voice:tts': (request: TTSRequest) => Uint8Array

  // graph
  'graph:get': (graphId: string) => WorkflowDAG
  'graph:save': (graph: WorkflowDAG) => WorkflowDAG

  // replay
  'replay:get': (sessionId: string) => ReplaySession
  'replay:getSessions': () => ReplaySession[]
  'replay:getEvents': (sessionId: string) => ReplayEvent[]
  'replay:deleteSession': (sessionId: string) => void

  // guard
  'guard:scan': (scope: string) => GuardScanResult

  // bench
  'bench:run': (reportId: string) => BenchReport
  'bench:getReport': (reportId: string) => BenchReport
  'bench:listTasks': (dimension?: BenchDimension) => BenchTask[]
  'bench:listModels': () => Array<{ id: string; provider: string; name: string }>
  'bench:runTask': (taskId: string, config: BenchRunConfig) => BenchRunResult
  'bench:runBatch': (taskIds: string[], config: BenchRunConfig) => BenchRunResult[]
  'bench:listRuns': (filters?: { dimension?: BenchDimension; modelId?: string }) => BenchRunResult[]
}

// ---------------------------------------------------------------------------
// Main → Renderer   (fire-and-forget push events)
// ---------------------------------------------------------------------------
export interface IpcRendererEvents {
  // terminal / pty
  'terminal:data': (payload: TerminalData) => void
  'terminal:exit': (payload: { id: string; code: number }) => void

  // swarm
  'swarm:update': (state: SwarmState) => void
  'swarm:message': (message: AgentMessage) => void

  // kanban / tasks
  'kanban:taskUpdated': (task: Task) => void

  // models
  'models:status': (payload: { modelId: ModelId; status: string }) => void

  // settings
  'settings:changed': (payload: { key: string; value: unknown }) => void

  // mcp
  'mcp:toolResult': (result: MCPToolResult) => void
  'mcp:serverStatus': (payload: { serverId: MCPServerId; status: string }) => void

  // memory
  'memory:entryAdded': (entry: MemoryEntry) => void

  // voice
  'voice:transcript': (segment: import('./types/index.js').TranscriptSegment) => void
  'voice:stateChange': (mode: VoiceMode) => void

  // graph
  'graph:updated': (graph: WorkflowDAG) => void

  // replay
  'replay:event': (event: ReplayEvent) => void

  // guard
  'guard:finding': (finding: GuardFinding) => void

  // bench
  'bench:progress': (payload: { reportId: string; progress: number }) => void
}
