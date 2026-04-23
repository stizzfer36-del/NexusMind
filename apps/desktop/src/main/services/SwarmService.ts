import crypto from 'crypto'
import type { IpcMainInvokeEvent } from 'electron'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import { WindowManager } from '../windows/WindowManager.js'
import { ModelProvider, ModelCapability, SwarmStatus, AgentRole as SharedAgentRole } from '@nexusmind/shared'
import type { ModelConfig, AgentMessage, SwarmConfig, SwarmState, SwarmSession } from '@nexusmind/shared'
import type { KanbanService } from './KanbanService.js'
import type { ModelRouter } from './ModelRouter.js'
import type { MemoryService } from './MemoryService.js'
import type { EventRecorder } from './EventRecorder.js'
import type { MCPService } from './MCPService.js'
import type { LinkService } from './LinkService.js'
import type { DatabaseService } from './DatabaseService.js'
import { SwarmGraph, type AgentGraphState } from './SwarmGraph.js'
import { parseAndValidateToolCalls, type ValidatedToolCall } from './ToolValidator.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENT_ROLES = ['scout', 'architect', 'coordinator', 'builder', 'reviewer', 'tester', 'docwriter'] as const
type AgentRole = typeof AGENT_ROLES[number]

const TOOL_INSTRUCTIONS = `
You have access to tools. To use a tool, output EXACTLY:
\`\`\`tool
{"name": "tool_name", "args": {"param": "value"}}
\`\`\`
Available tools: read_file, write_file, list_dir, run_shell, web_fetch, search_memory.
`

const ROLE_PROMPTS: Record<AgentRole, string> = {
  scout:       TOOL_INSTRUCTIONS + 'You are the scout agent. Use list_dir and read_file to map the repository structure. Identify all relevant files for the task. Output a structured file map with ownership notes.',
  architect:   TOOL_INSTRUCTIONS + 'You are the architect agent. Based on the scout\'s repo map and the task, produce a multi-sprint implementation plan with clear file change ownership per builder agent.',
  coordinator: TOOL_INSTRUCTIONS + 'You are the coordinator agent. Analyze the task and produce a clear, actionable implementation plan.',
  builder:     TOOL_INSTRUCTIONS + 'You are the builder agent. Write clean, working code to implement the described task.',
  reviewer:    TOOL_INSTRUCTIONS + 'You are the reviewer agent. Review the task output for correctness, bugs, and suggest improvements.',
  tester:      TOOL_INSTRUCTIONS + 'You are the tester agent. Write tests or describe how to test the described feature.',
  docwriter:   TOOL_INSTRUCTIONS + 'You are the docwriter agent. Write clear documentation or a summary for the described task.',
}

const DEFAULT_MODEL_CONFIG: ModelConfig = {
  id: 'claude-sonnet-4-6',
  provider: ModelProvider.ANTHROPIC,
  name: 'Claude Sonnet 4.6',
  capabilities: [ModelCapability.CHAT, ModelCapability.STREAMING],
  contextWindow: 200_000,
  maxTokens: 4_096,
}

const TOOL_PATTERN = /```tool\s*\n(\{[\s\S]*?\})\s*\n```/g

// ---------------------------------------------------------------------------
// SwarmService
// ---------------------------------------------------------------------------

export class SwarmService {
  private sessions: Map<string, SwarmSession> = new Map()
  private cancelFlags: Map<string, boolean> = new Map()
  private fileLocks: Map<string, string> = new Map()

  init(): void {
    ServiceRegistry.getInstance().register(SERVICE_TOKENS.SwarmService, this)
    this._rehydrateSessions()
  }

  private _rehydrateSessions(): void {
    try {
      const dbService = ServiceRegistry.getInstance().resolve<DatabaseService>(SERVICE_TOKENS.DB)
      const db = dbService.getDb()
      const rows = db.prepare(`SELECT * FROM swarm_sessions ORDER BY created_at DESC LIMIT 100`).all() as any[]
      for (const row of rows) {
        const session: SwarmSession = {
          id: row.id,
          name: row.name,
          config: JSON.parse(row.config_json),
          state: JSON.parse(row.state_json),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }
        this.sessions.set(session.id, session)
      }
      console.log(`[SwarmService] Rehydrated ${rows.length} sessions from database`)
    } catch (err) {
      console.warn('[SwarmService] Failed to rehydrate sessions:', err)
    }
  }

  // -------------------------------------------------------------------------
  // push — IPC event to renderer
  // -------------------------------------------------------------------------

  private push(channel: string, payload: unknown): void {
    WindowManager.getInstance().get('main')?.webContents.send(channel, payload)
    if (channel === 'swarm:update') {
      try {
        const link = ServiceRegistry.getInstance().resolve<LinkService>(SERVICE_TOKENS.LinkService)
        link.broadcast({ type: 'swarm:status', payload })
      } catch { /* link not ready */ }
    }
  }

  // -------------------------------------------------------------------------
  // createSession
  // -------------------------------------------------------------------------

  createSession(config: SwarmConfig, name?: string): SwarmSession {
    const now = Date.now()
    const session: SwarmSession = {
      id: crypto.randomUUID(),
      name: name ?? `Session ${now}`,
      config,
      state: {
        status: SwarmStatus.IDLE,
        currentRound: 0,
        agentIds: [],
        messages: [],
        consensusReached: false,
      },
      createdAt: now,
      updatedAt: now,
    }
    this.sessions.set(session.id, session)
    this.push('swarm:sessionCreated', session)
    try {
      const dbService = ServiceRegistry.getInstance().resolve<DatabaseService>(SERVICE_TOKENS.DB)
      const db = dbService.getDb()
      db.prepare(
        `INSERT INTO swarm_sessions (id, name, config_json, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        session.id,
        session.name,
        JSON.stringify(session.config),
        JSON.stringify(session.state),
        session.createdAt,
        session.updatedAt,
      )
    } catch (err) {
      console.warn('[SwarmService] Failed to persist session:', err)
    }
    return session
  }

  // -------------------------------------------------------------------------
  // getSession
  // -------------------------------------------------------------------------

  getSession(id: string): SwarmSession | null {
    return this.sessions.get(id) ?? null
  }

  // -------------------------------------------------------------------------
  // listSessions
  // -------------------------------------------------------------------------

  listSessions(): SwarmSession[] {
    return [...this.sessions.values()]
  }

  // -------------------------------------------------------------------------
  // startSession
  // -------------------------------------------------------------------------

  async startSession(id: string): Promise<void> {
    const session = this.sessions.get(id)
    if (!session) {
      console.warn(`[SwarmService] startSession: session not found — ${id}`)
      return
    }

    const registry = ServiceRegistry.getInstance()

    // Lazy EventRecorder — initializes last, may not be ready
    let recorder: EventRecorder | null = null
    try { recorder = registry.resolve<EventRecorder>(SERVICE_TOKENS.EventRecorder) } catch {}
    recorder?.startSession(id, session.name)

    this.cancelFlags.set(id, false)

    // Phase 1: ORCHESTRATING
    session.state.status = SwarmStatus.ORCHESTRATING
    session.state.currentRound = 0
    session.state.consensusReached = false
    session.updatedAt = Date.now()
    this.push('swarm:update', { id, state: session.state })
    console.log(`[SwarmService] Session ${id} — orchestrating`)

    // Assign one agentId per role
    const agentIds: Record<AgentRole, string> = {
      scout: crypto.randomUUID(),
      architect: crypto.randomUUID(),
      coordinator: crypto.randomUUID(),
      builder: crypto.randomUUID(),
      reviewer: crypto.randomUUID(),
      tester: crypto.randomUUID(),
      docwriter: crypto.randomUUID(),
    }
    session.state.agentIds = Object.values(agentIds)
    session.updatedAt = Date.now()

    // Seed kanban tasks
    try {
      const kanban = registry.resolve<KanbanService>(SERVICE_TOKENS.KanbanService)
      kanban.bulkCreate([
        { title: `Plan: ${session.name}`,      description: `Planning phase for session: ${session.name}`,      column: 'backlog', priority: 'medium' },
        { title: `Implement: ${session.name}`, description: `Implementation phase for session: ${session.name}`, column: 'backlog', priority: 'medium' },
        { title: `Review: ${session.name}`,    description: `Review phase for session: ${session.name}`,         column: 'backlog', priority: 'medium' },
      ])
    } catch (err) {
      console.warn('[SwarmService] bulkCreate failed:', err)
    }

    // Phase 2: EXECUTING
    session.state.status = SwarmStatus.EXECUTING
    session.updatedAt = Date.now()
    this.push('swarm:update', { id, state: session.state })

    // Build initial graph state
    const initialGraphState: AgentGraphState = {
      sessionId: id,
      goal: session.name,
      tasks: [],
      agentOutputs: [],
      reviewPassed: false,
      testPassed: false,
      currentRound: 0,
      maxRounds: session.config.maxRounds,
      cancelled: false,
      toolResults: [],
    }

    // Build the graph
    const graph = new SwarmGraph<AgentGraphState>()

    // Add nodes — each calls executeAgentRole for its role
    const roles: AgentRole[] = ['scout', 'architect', 'coordinator', 'builder', 'reviewer', 'tester', 'docwriter']
    for (const role of roles) {
      const agentId = agentIds[role]
      graph.addNode({
        id: role,
        execute: (state) => this.executeAgentRole(role, state, agentId),
      })
    }

    // Add END node (no-op)
    graph.addNode({ id: 'END', execute: async (state) => state })

    // Edges
    graph.addEdge({ from: 'scout', to: 'architect' })
    graph.addEdge({ from: 'architect', to: 'coordinator' })
    graph.addEdge({ from: 'coordinator', to: 'builder' })
    graph.addEdge({ from: 'builder', to: 'reviewer' })
    graph.addEdge({ from: 'reviewer', to: 'builder', condition: (s) => !s.cancelled && !s.reviewPassed && s.currentRound < s.maxRounds })
    graph.addEdge({ from: 'reviewer', to: 'tester', condition: (s) => !s.cancelled && s.reviewPassed })
    graph.addEdge({ from: 'tester', to: 'builder', condition: (s) => !s.cancelled && !s.testPassed && s.currentRound < s.maxRounds })
    graph.addEdge({ from: 'tester', to: 'docwriter', condition: (s) => !s.cancelled && s.testPassed })
    graph.addEdge({ from: 'docwriter', to: 'END' })

    graph.setEntry('scout')
    graph.setEnd(['END'])

    // State change callback — update session state and push to renderer
    const onStateChange = (graphState: AgentGraphState, nodeId: string) => {
      session.state.currentRound = graphState.currentRound
      session.updatedAt = Date.now()
      this.push('swarm:update', { id, state: session.state, activeNode: nodeId })
      recorder?.record({
        sessionId: id,
        type: 'graph:transition',
        nodeId: nodeId,
        payload: {
          round: graphState.currentRound,
          reviewPassed: graphState.reviewPassed,
          testPassed: graphState.testPassed,
        }
      })
    }

    // Timeout guard
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    if (session.config.timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        initialGraphState.cancelled = true
        this.cancelFlags.set(id, true)
        console.log(`[SwarmService] Session ${id} — timeout reached`)
      }, session.config.timeoutMs)
    }

    let failed = false
    try {
      await graph.run(initialGraphState, onStateChange)
    } catch (err) {
      console.error(`[SwarmService] Session ${id} — graph error:`, err)
      session.state.status = SwarmStatus.FAILED
      failed = true
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
    }

    recorder?.endSession(id)

    // Phase 3: COMPLETED
    if (!failed && !this.cancelFlags.get(id)) {
      session.state.status = SwarmStatus.COMPLETED
      session.state.consensusReached = true
    }
    session.updatedAt = Date.now()
    this.push('swarm:update', { id, state: session.state })
    console.log(`[SwarmService] Session ${id} — ${session.state.status}`)
  }

  // -------------------------------------------------------------------------
  // executeAgentRole — single graph node execution for a given role
  // -------------------------------------------------------------------------

  private async executeAgentRole(
    role: AgentRole,
    state: AgentGraphState,
    agentId: string,
  ): Promise<AgentGraphState> {
    // TODO: wire LLM here (v0.0.1 stub — actual LLM routing below)
    // Check cancellation first
    if (state.cancelled || this.cancelFlags.get(state.sessionId)) {
      state.cancelled = true
      return state
    }

    const registry = ServiceRegistry.getInstance()

    // Resolve required services
    let kanban: KanbanService
    let modelRouter: ModelRouter
    let memory: MemoryService
    try {
      kanban      = registry.resolve<KanbanService>(SERVICE_TOKENS.KanbanService)
      modelRouter = registry.resolve<ModelRouter>(SERVICE_TOKENS.ModelRouter)
      memory      = registry.resolve<MemoryService>(SERVICE_TOKENS.MemoryService)
    } catch (err) {
      console.error(`[SwarmService] executeAgentRole(${role}) — failed to resolve services:`, err)
      return state
    }

    // Get next task for this role
    const task = kanban.getNextTask(role)
    if (!task) {
      if (role === 'reviewer') {
        state.reviewPassed = true
        return state
      }
      if (role === 'tester') {
        state.testPassed = true
        return state
      }
      return state
    }

    // Assign task to this agent
    try {
      kanban.assignToAgent(task.id, agentId)
    } catch (err) {
      console.warn(`[SwarmService] assignToAgent failed for task ${task.id}:`, err)
    }

    // Acquire file locks before execution
    const filePaths = this._extractFilePaths(`${task.title} ${task.description ?? ''}`)
    if (filePaths.length > 0) {
      if (!this.acquireFileLock(agentId, filePaths)) {
        let conflictingAgentId = ''
        for (const fp of filePaths) {
          const holder = this.fileLocks.get(fp)
          if (holder && holder !== agentId) {
            conflictingAgentId = holder
            break
          }
        }
        this.push('swarm:fileLockConflict', { conflictingAgentId, filePaths })
        throw new Error('file-lock-conflict')
      }
    }

    try {
      // Build messages array with system prompt + task content
      const systemPrompt = ROLE_PROMPTS[role] ?? ''

      let memoryContext = ''
      try {
        const results = await memory.search(task.title + ' ' + (task.description ?? ''), 5)
        if (results.length > 0) {
          memoryContext =
            '\n\n## Relevant Past Context (from NexusMemory):\n' +
            results
              .slice(0, 5)
              .map((r: any, i: number) => `${i + 1}. ${r.entry.content.slice(0, 300)}`)
              .join('\n')
        }
      } catch (err) {
        console.warn(`[SwarmService] executeAgentRole(${role}) — memory search failed:`, err)
      }

      const messages: AgentMessage[] = [
        {
          id: crypto.randomUUID(),
          agentId,
          role: SharedAgentRole.USER,
          content: `${systemPrompt}${memoryContext}\n\nTask: ${task.title}\n\n${task.description ?? ''}`,
          timestamp: Date.now(),
        },
      ]

      // Stream from modelRouter, accumulate response string
      let response = ''
      try {
        for await (const chunk of modelRouter.route(DEFAULT_MODEL_CONFIG, messages)) {
          if (chunk.content) {
            response += chunk.content
          }
          if (chunk.isDone) break
        }
      } catch (err) {
        console.error(`[SwarmService] executeAgentRole(${role}) — model error on task "${task.title}":`, err)
        throw err
      }

      // Check cancellation after streaming
      if (state.cancelled || this.cancelFlags.get(state.sessionId)) {
        state.cancelled = true
        return state
      }

      // Lazy recorder
      let recorder: EventRecorder | null = null
      try {
        const reg = ServiceRegistry.getInstance()
        recorder = reg.resolve<EventRecorder>(SERVICE_TOKENS.EventRecorder)
      } catch {}
      recorder?.record({
        sessionId: state.sessionId,
        type: 'agent:output',
        nodeId: role,
        agentId,
        payload: { content: response.slice(0, 1000), taskTitle: task?.title ?? '' }
      })

      // Parse tool calls with TOOL_PATTERN regex, execute via mcpService if available
      const toolResults: string[] = []

      let mcpService: MCPService | null = null
      try {
        mcpService = registry.resolve<MCPService>(SERVICE_TOKENS.MCPService)
      } catch {
        // MCPService not available — skip tool execution
      }

      if (mcpService) {
        const validatedCalls = parseAndValidateToolCalls(response)
        
        for (const call of validatedCalls) {
          if (!call.valid) {
            const errorMsg = `Tool validation error for agent ${agentId} (${role}): ${call.errors.join(', ')}`
            toolResults.push(errorMsg)
            recorder?.record({
              sessionId: state.sessionId,
              type: 'tool:validation-error',
              nodeId: role,
              agentId,
              payload: { errors: call.errors, rawArgs: call.rawArgs },
            })
            console.error(`[SwarmService] ${errorMsg}`)
            continue
          }
          
          const validCall = call as ValidatedToolCall
          try {
            console.log(`[SwarmService] Agent ${agentId} (${role}) — executing tool: ${validCall.name}`)
            const result = await mcpService.executeTool(validCall.name, validCall.args)
            const resultStr = `[Tool: ${validCall.name}] Result: ${JSON.stringify(result).slice(0, 500)}`
            toolResults.push(resultStr)
            console.log(`[SwarmService] ${resultStr}`)
          } catch (err) {
            const errorMsg = `Tool execution error for agent ${agentId} (${role}): ${String(err)}`
            toolResults.push(errorMsg)
            recorder?.record({
              sessionId: state.sessionId,
              type: 'tool:execution-error',
              nodeId: role,
              agentId,
              payload: { tool: validCall.name, error: String(err) },
            })
            console.error(`[SwarmService] ${errorMsg}`)
          }
        }
      }

      // Mark task complete in kanban
      try {
        kanban.updateTask(task.id, { column: 'done', assignee: agentId })
      } catch (err) {
        console.warn(`[SwarmService] updateTask failed for task ${task.id}:`, err)
      }

      // Persist to memory
      try {
        const fullContent = toolResults.length > 0
          ? `${response}\n\nTools used:\n${toolResults.join('\n')}`
          : response
        await memory.store({
          type: 'episodic',
          content: fullContent,
          source: `${agentId}:${role}`,
        })
      } catch (err) {
        console.warn(`[SwarmService] memory.store failed for agent ${agentId}:`, err)
      }

      // Role-specific outcome evaluation
      if (role === 'reviewer') {
        const verdictPrompt = 'Based on your review above, respond with EXACTLY one word on a new line: APPROVED or REJECTED'
        try {
          const verdictMessages = [
            ...messages,
            { id: crypto.randomUUID(), agentId, role: SharedAgentRole.ASSISTANT, content: response, timestamp: Date.now() },
            { id: crypto.randomUUID(), agentId, role: SharedAgentRole.USER, content: verdictPrompt, timestamp: Date.now() },
          ]
          let verdictResponse = ''
          for await (const chunk of modelRouter.route(DEFAULT_MODEL_CONFIG, verdictMessages as AgentMessage[])) {
            if (chunk.content) {
              verdictResponse += chunk.content
            }
            if (chunk.isDone) break
          }
          state.reviewPassed = verdictResponse.trim().toUpperCase().startsWith('APPROVED')
        } catch {
          const rejectionKeywords = ['reject', 'incorrect', 'wrong', 'fail', 'bug', 'error', 'broken']
          const lower = response.toLowerCase()
          state.reviewPassed = !rejectionKeywords.some((kw) => lower.includes(kw))
        }
      }

      if (role === 'tester') {
        const failureKeywords = ['fail', 'failing', 'broken', 'no tests', 'cannot test']
        const lower = response.toLowerCase()
        state.testPassed = !failureKeywords.some((kw) => lower.includes(kw))
      }

      // Append to agentOutputs
      state.agentOutputs.push({
        agentId,
        role,
        content: response,
        round: state.currentRound,
      })

      // Increment round counter
      state.currentRound += 1

      // Push truncated output to session messages
      const session = this.sessions.get(state.sessionId)
      if (session) {
        let fullOutput = response
        if (toolResults.length > 0) {
          fullOutput += '\n' + toolResults.join('\n')
        }
        const truncated = fullOutput.length > 500 ? `${fullOutput.slice(0, 500)}…` : fullOutput
        session.state.messages.push(truncated)
      }

      // Brief inter-task pause
      await this._delay(500)

      return state
    } finally {
      this.releaseFileLock(agentId)
    }
  }

  // -------------------------------------------------------------------------
  // stopSession
  // -------------------------------------------------------------------------

  stopSession(id: string): void {
    this.cancelFlags.set(id, true)

    const session = this.sessions.get(id)
    if (!session) return

    session.state.status = SwarmStatus.IDLE
    session.updatedAt = Date.now()
    this.push('swarm:update', { id, state: session.state })
    console.log(`[SwarmService] Session ${id} — stopped by user`)
  }

  // -------------------------------------------------------------------------
  // IPC handlers
  // -------------------------------------------------------------------------

  getAgents(): import('@nexusmind/shared').AgentInfo[] {
    const agents: import('@nexusmind/shared').AgentInfo[] = []
    const roleList: AgentRole[] = ['coordinator', 'builder', 'reviewer', 'tester', 'docwriter']
    for (const session of this.sessions.values()) {
      for (let i = 0; i < session.state.agentIds.length; i++) {
        const agentId = session.state.agentIds[i]
        const role = roleList[i % roleList.length]
        agents.push({
          id: agentId,
          role,
          sessionId: session.id,
          sessionName: session.name,
          status: session.state.status,
        })
      }
    }
    return agents
  }

  getHandlers(): Record<string, (event: IpcMainInvokeEvent, ...args: any[]) => any> {
    return {
      'swarm:create': (_event: IpcMainInvokeEvent, config: SwarmConfig, name?: string) =>
        this.createSession(config, name),

      'swarm:start': (_event: IpcMainInvokeEvent, session: SwarmSession) => {
        const found = this.getSession(session.id)
        if (found) {
          this.startSession(session.id).catch(console.error)
          return found
        }
        return null
      },

      'swarm:stop': (_event: IpcMainInvokeEvent, sessionId: string) =>
        this.stopSession(sessionId),

      'swarm:getState': (_event: IpcMainInvokeEvent, sessionId: string) =>
        this.getSession(sessionId)?.state ?? null,

      'swarm:getAgents': () => this.getAgents(),

      'swarm:list': () => this.listSessions(),
      'swarm:listSessions': () => this.listSessions(),
      'swarm:getSession': (_event: IpcMainInvokeEvent, id: string) => this.getSession(id),
    }
  }

  // -------------------------------------------------------------------------
  // File locks
  // -------------------------------------------------------------------------

  private acquireFileLock(agentId: string, filePaths: string[]): boolean {
    for (const fp of filePaths) {
      const existing = this.fileLocks.get(fp)
      if (existing && existing !== agentId) {
        return false
      }
    }
    for (const fp of filePaths) {
      this.fileLocks.set(fp, agentId)
    }
    return true
  }

  private releaseFileLock(agentId: string): void {
    for (const [fp, holder] of this.fileLocks.entries()) {
      if (holder === agentId) {
        this.fileLocks.delete(fp)
      }
    }
  }

  getFileLocks(): Record<string, string> {
    const result: Record<string, string> = {}
    for (const [fp, id] of this.fileLocks.entries()) {
      result[fp] = id
    }
    return result
  }

  private _extractFilePaths(text: string): string[] {
    const paths = new Set<string>()
    const unix = /(?:\/[\w\-]+)+(?:\.[\w]+)?/g
    const win = /[A-Za-z]:\\(?:[\w\-]+\\)*[\w\-]+(?:\.[\w]+)?/g
    let m: RegExpExecArray | null
    while ((m = unix.exec(text)) !== null) paths.add(m[0])
    while ((m = win.exec(text)) !== null) paths.add(m[0])
    return Array.from(paths)
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
