import type {
  AgentMessage,
  BenchDimension,
  BenchReport,
  BenchRunConfig,
  BenchRunResult,
  BenchTask,
  GuardFinding,
  GuardRun,
  GuardPolicy,
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
  VoiceConfig,
  VoiceMode,
  VoiceSession,
  WorkflowDAG,
  WorkflowTemplate,
  WorkflowRunRequest,
  StreamChunk,
  LinkConfig,
  SyncConfig,
  SyncSummary,
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
  'swarm:create': (config: import('./types/swarm.types.js').SwarmConfig, name?: string) => SwarmSession
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
  'voice:getConfig': () => VoiceConfig
  'voice:setConfig': (config: VoiceConfig) => void
  'voice:startSession': () => { sessionId: string }
  'voice:getSession': (sessionId: string) => VoiceSession | null
  'voice:listSessions': () => VoiceSession[]
  'voice:transcribeChunk': (sessionId: string, audioChunk: ArrayBuffer | Buffer) => { text: string }
  'voice:speakText': (text: string) => { audioId: string }

  // graph
  'graph:list': () => WorkflowDAG[]
  'graph:load': (dagId: string) => WorkflowDAG | null
  'graph:save': (dag: WorkflowDAG) => void
  'graph:delete': (dagId: string) => void
  'graph:templates': () => WorkflowTemplate[]
  'graph:execute': (payload: WorkflowRunRequest) => { runId: string }

  // replay
  'replay:get': (sessionId: string) => ReplaySession
  'replay:getSessions': () => ReplaySession[]
  'replay:getEvents': (sessionId: string) => ReplayEvent[]
  'replay:deleteSession': (sessionId: string) => void

  // guard
  'guard:run': () => { runId: string }
  'guard:getRun': (runId: string) => GuardRun | null
  'guard:listRuns': () => GuardRun[]
  'guard:getFindings': (runId: string) => GuardFinding[]
  'guard:getPolicy': () => GuardPolicy
  'guard:setPolicy': (policy: GuardPolicy) => void

  // bench
  'bench:run': (reportId: string) => BenchReport
  'bench:getReport': (reportId: string) => BenchReport
  'bench:listTasks': (dimension?: BenchDimension) => BenchTask[]
  'bench:listModels': () => Array<{ id: string; provider: string; name: string }>
  'bench:runTask': (taskId: string, config: BenchRunConfig) => BenchRunResult
  'bench:runBatch': (taskIds: string[], config: BenchRunConfig) => BenchRunResult[]
  'bench:listRuns': (filters?: { dimension?: BenchDimension; modelId?: string }) => BenchRunResult[]

  // onboarding
  'onboarding:complete': () => void

  // link
  'link:getConfig': () => LinkConfig
  'link:setConfig': (config: LinkConfig) => void

  // sync
  'sync:getConfig': () => SyncConfig
  'sync:setConfig': (config: SyncConfig) => void
  'sync:getSummary': () => SyncSummary
  'sync:trigger': () => SyncSummary
}

// ---------------------------------------------------------------------------
// Main → Renderer   (fire-and-forget push events)
// ---------------------------------------------------------------------------
export interface IpcRendererEvents {
  // terminal / pty
  'terminal:data': (payload: TerminalData) => void
  'terminal:exit': (payload: { id: string; code: number }) => void

  // swarm
  'swarm:update': (payload: SwarmState & { id?: string; activeNode?: string }) => void
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
  'voice:audioReady': (payload: { audioId: string; data: number[] }) => void

  // graph
  'graph:updated': (graph: WorkflowDAG) => void

  // replay
  'replay:event': (event: ReplayEvent) => void

  // guard
  'guard:finding': (finding: GuardFinding) => void

  // bench
  'bench:progress': (payload: { reportId: string; progress: number }) => void

  // link
  'link:statusChange': (status: { running: boolean; clientCount: number }) => void

  // sync
  'sync:statusChange': (summary: SyncSummary) => void
}
