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
  FixSuggestion,
  GuardTrendPoint,
  PreCommitResult,
  SarifReport,
  SecurityScore,
  MCPServerConfig,
  MCPServerId,
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  MCPToolDefinition,
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

  'pty:create': (shell?: string) => TerminalSession
  'pty:write': (id: string, data: string) => void
  'pty:resize': (id: string, cols: number, rows: number) => void
  'pty:close': (id: string) => void

  // swarm
  'swarm:create': (config: import('./types/swarm.types.js').SwarmConfig, name?: string) => SwarmSession
  'swarm:listSessions': () => SwarmSession[]
  'swarm:start': (config: SwarmSession) => SwarmSession
  'swarm:stop': (sessionId: string) => void
  'swarm:getState': (sessionId: string) => SwarmState
  'swarm:getAgents': () => import('./types/agent.types.js').AgentInfo[]

  // kanban / tasks
  'kanban:listTasks': () => Task[]
  'kanban:getTasks': () => Task[]
  'kanban:createTask': (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Task
  'kanban:updateTask': (task: Task) => Task
  'kanban:deleteTask': (taskId: string) => void
  'kanban:moveTask': (payload: { taskId: string; column: TaskColumn }) => Task

  // models
  'models:list': () => ModelConfig[]
  'models:getConfig': (modelId: ModelId) => ModelConfig
  'models:streamChat': (payload: { modelId: ModelId; messages: Array<{ role: string; content: string }> }) => AsyncIterable<StreamChunk>
  'model:validate': (provider: string) => boolean
  'model:stream': (payload: { modelId: ModelId; messages: Array<{ role: string; content: string }> }) => { streamId: string; ok: boolean; error?: string }

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
  'mcp:getServerStatus': (serverId: MCPServerId) => { status: string; pid?: number; restarts: number } | null

  // memory
  'memory:list': (type?: MemoryType) => MemoryEntry[]
  'memory:search': (payload: { query: string; type?: MemoryType }) => MemorySearchResult[]
  'memory:add': (entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'accessedAt'>) => MemoryEntry
  'memory:delete': (id: string) => void
  'memory:mcpExpose': () => MCPToolDefinition
  'memory:mcpStatus': () => { exposed: boolean; toolName: string }

  // voice
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
  'guard:approvalResponse': (payload: { requestId: string; approved: boolean }) => void
  'guard:getSecurityScore': () => SecurityScore
  'guard:getTrends': () => GuardTrendPoint[]
  'guard:exportSarif': (runId?: string) => SarifReport
  'guard:fixSuggestion': (findingId: string) => FixSuggestion | null
  'guard:scanFile': (filePath: string) => GuardFinding[]
  'guard:preCommitCheck': () => PreCommitResult

  // bench
  'bench:listTasks': (dimension?: BenchDimension) => BenchTask[]
  'bench:listModels': () => Array<{ id: string; provider: string; name: string }>
  'bench:runTask': (taskId: string, config: BenchRunConfig) => BenchRunResult
  'bench:runBatch': (taskIds: string[], config: BenchRunConfig) => BenchRunResult[]
  'bench:listRuns': (filters?: { dimension?: BenchDimension; modelId?: string }) => BenchRunResult[]

  // link
  'link:getConfig': () => LinkConfig
  'link:setConfig': (config: LinkConfig) => void

  // sync
  'sync:getConfig': () => SyncConfig
  'sync:setConfig': (config: SyncConfig) => void
  'sync:getSummary': () => SyncSummary
  'sync:trigger': () => SyncSummary

  // dialog
  'dialog:openDirectory': () => string | null

  // context
  'context:setActiveFile': (filePath: string, content: string) => { ok: boolean }
  'context:getActiveFile': () => { path: string; content: string } | null
  'context:getSystemContext': () => string

  // updater
  'updater:install': () => void

  // file
  'file:read': (filePath: string) => string
  'file:write': (filePath: string, content: string) => void
  'file:listDir': (dirPath: string) => Array<{ name: string; path: string; isDirectory: boolean; size: number; mtime: number }>
  'file:applyDiff': (filePath: string, diff: import('./utils/diff.utils.js').DiffResult) => string
  'file:watch': (filePath: string) => string
  'file:unwatch': (id: string) => void
}

// ---------------------------------------------------------------------------
// Main → Renderer   (fire-and-forget push events)
// ---------------------------------------------------------------------------
export interface IpcRendererEvents {
  // terminal / pty
  'terminal:data': (payload: TerminalData) => void
  'terminal:exit': (payload: { id: string; code: number }) => void

  'pty:data': (payload: TerminalData) => void
  'pty:exit': (payload: { id: string; code: number }) => void

  // swarm
  'swarm:update': (payload: SwarmState & { id?: string; activeNode?: string }) => void
  'swarm:message': (message: AgentMessage) => void
  'swarm:sessionCreated': (session: SwarmSession) => void
  'swarm:fileLockConflict': (payload: { conflictingAgentId: string; filePaths: string[] }) => void

  // kanban / tasks
  'kanban:taskUpdated': (task: Task) => void
  'kanban:taskLocked': (payload: { taskId: string; agentId?: string }) => void
  'kanban:taskUnlocked': (payload: { taskId: string }) => void

  // models
  'models:status': (payload: { modelId: ModelId; status: string }) => void

  // settings
  'settings:changed': (payload: { key: string; value: unknown }) => void

  // mcp
  'mcp:toolResult': (result: MCPToolResult) => void
  'mcp:serverStatus': (payload: { serverId: MCPServerId; status: string }) => void
  'mcp:serverDown': (payload: { serverId: MCPServerId; reason: string }) => void
  'mcp:serverUp': (payload: { serverId: MCPServerId; pid: number }) => void

  // memory
  'memory:entryAdded': (entry: MemoryEntry) => void

  // voice
  'voice:transcript': (segment: import('./types/index.js').TranscriptSegment) => void
  'voice:stateChange': (mode: VoiceMode) => void
  'voice:audioReady': (payload: { audioId: string; data: number[] }) => void

  // graph
  'graph:updated': (graph: WorkflowDAG) => void
  'workflow:stepComplete': (payload: { nodeId: string; status: string; output?: string }) => void

  // replay
  'replay:event': (event: ReplayEvent) => void

  // guard
  'guard:finding': (finding: GuardFinding) => void
  'guard:progress': (payload: { scanner: string; status: string; findings: GuardFinding[] }) => void
  'guard:complete': (payload: { runId: string; findings: GuardFinding[] }) => void
  'guard:requestApproval': (payload: { requestId: string; action: string; reason: string; severity: string }) => void
  'guard:fileScanResult': (payload: { filePath: string; findings: GuardFinding[] }) => void
  'guard:preCommitResult': (payload: PreCommitResult) => void

  // bench
  'bench:progress': (payload: { reportId: string; progress: number }) => void

  // link
  'link:statusChange': (status: { running: boolean; clientCount: number }) => void

  // sync
  'sync:statusChange': (summary: SyncSummary) => void

  // streaming (ModelRouter)
  'stream:data': (payload: { id: string; delta: string }) => void
  'stream:end': (payload: { id: string }) => void

  // model streaming
  'model:token': (payload: { streamId: string; token: string; index: number }) => void
  'model:done': (payload: { streamId: string; finishReason?: string; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }) => void
  'model:error': (payload: { streamId: string; error: string }) => void

  // updater
  'updater:available': (payload: { version: string; releaseNotes?: string }) => void
  'updater:ready': (payload: { version: string }) => void
  'updater:error': (payload: { message: string }) => void

  // file
  'file:watchEvent': (payload: { id: string; eventType: string; path?: string }) => void

  // app health
  'app:serviceHealth': (payload: { failed: string[] }) => void
  'app:rendererCrash': (payload: {
    panelName?: string
    message: string
    stack?: string
    componentStack?: string
    timestamp: number
  }) => void
}
