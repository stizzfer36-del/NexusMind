import crypto from 'crypto'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import { WindowManager } from '../windows/WindowManager.js'
import { ModelProvider, ModelCapability } from '@nexusmind/shared'
import type { ModelConfig, StreamChunk, AgentMessage } from '@nexusmind/shared'
import type { KanbanService } from './KanbanService.js'
import type { ModelRouter } from './ModelRouter.js'
import type { MemoryService } from './MemoryService.js'
import { SwarmGraph, type AgentGraphState } from './SwarmGraph.js'

// ---------------------------------------------------------------------------
// Local type definitions (do not import from @nexusmind/shared)
// ---------------------------------------------------------------------------

enum SwarmStatus {
  IDLE = 'idle',
  ORCHESTRATING = 'orchestrating',
  EXECUTING = 'executing',
  CONVERGING = 'converging',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

interface SwarmConfig {
  maxAgents: number
  maxRounds: number
  consensusThreshold: number
  timeoutMs: number
  enableReflection: boolean
}

interface SwarmState {
  status: SwarmStatus
  currentRound: number
  agentIds: string[]
  messages: string[]
  consensusReached: boolean
}

interface SwarmSession {
  id: string
  name: string
  config: SwarmConfig
  state: SwarmState
  createdAt: number
  updatedAt: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENT_ROLES = ['coordinator', 'builder', 'reviewer', 'tester', 'docwriter'] as const
type AgentRole = typeof AGENT_ROLES[number]

const TOOL_INSTRUCTIONS = `
You have access to tools. To use a tool, output EXACTLY:
\`\`\`tool
{"name": "tool_name", "args": {"param": "value"}}
\`\`\`
Available tools: read_file, write_file, list_dir, run_shell, web_fetch, search_memory.
`

const ROLE_PROMPTS: Record<AgentRole, string> = {
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

// ---------------------------------------------------------------------------
// SwarmService
// ---------------------------------------------------------------------------

export class SwarmService {
  private sessions: Map<string, SwarmSession> = new Map()
  private cancelFlags: Map<string, boolean> = new Map()

  init(): void {
    ServiceRegistry.getInstance().register(SERVICE_TOKENS.SwarmService, this)
  }

  // -------------------------------------------------------------------------
  // push — IPC event to renderer
  // -------------------------------------------------------------------------

  private push(channel: string, payload: unknown): void {
    WindowManager.getInstance().get('main')?.webContents.send(channel, payload)
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
      ;(kanban as any).bulkCreate([
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
    const roles: AgentRole[] = ['coordinator', 'builder', 'reviewer', 'tester', 'docwriter']
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
    graph.addEdge({ from: 'coordinator', to: 'builder' })
    graph.addEdge({ from: 'builder', to: 'reviewer' })
    graph.addEdge({ from: 'reviewer', to: 'builder', condition: (s) => !s.reviewPassed && s.currentRound < s.maxRounds })
    graph.addEdge({ from: 'reviewer', to: 'tester', condition: (s) => s.reviewPassed })
    graph.addEdge({ from: 'tester', to: 'builder', condition: (s) => !s.testPassed && s.currentRound < s.maxRounds })
    graph.addEdge({ from: 'tester', to: 'docwriter', condition: (s) => s.testPassed })
    graph.addEdge({ from: 'docwriter', to: 'END' })

    graph.setEntry('coordinator')
    graph.setEnd(['END'])

    // State change callback — update session state and push to renderer
    const onStateChange = (graphState: AgentGraphState, nodeId: string) => {
      session.state.currentRound = graphState.currentRound
      session.updatedAt = Date.now()
      this.push('swarm:update', { id, state: session.state, activeNode: nodeId })
    }

    try {
      await graph.run(initialGraphState, onStateChange)
    } catch (err) {
      console.error(`[SwarmService] Session ${id} — graph error:`, err)
    }

    // Phase 3: COMPLETED
    if (!this.cancelFlags.get(id)) {
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
    // Check cancellation first
    if (state.cancelled) return state

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
    const task = (kanban as any).getNextTask(role) as { id: string; title: string; description: string } | null
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
      ;(kanban as any).assignToAgent(task.id, agentId)
    } catch (err) {
      console.warn(`[SwarmService] assignToAgent failed for task ${task.id}:`, err)
    }

    // Build messages array with system prompt + task content
    const systemPrompt = ROLE_PROMPTS[role] ?? ''
    const messages: AgentMessage[] = [
      {
        id: crypto.randomUUID(),
        agentId,
        role: 'user' as any,
        content: `${systemPrompt}\n\nTask: ${task.title}\n\n${task.description ?? ''}`,
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
      await this._delay(500)
      return state
    }

    // Parse tool calls with TOOL_PATTERN regex, execute via mcpService if available
    const TOOL_PATTERN = /```tool\s*\n(\{[\s\S]*?\})\s*\n```/g
    const toolResults: string[] = []

    let mcpService: any = null
    try {
      mcpService = registry.resolve<any>(SERVICE_TOKENS.MCPService)
    } catch {
      // MCPService not available — skip tool execution
    }

    if (mcpService) {
      let toolMatch: RegExpExecArray | null
      while ((toolMatch = TOOL_PATTERN.exec(response)) !== null) {
        const rawJson = toolMatch[1]
        try {
          const call = JSON.parse(rawJson) as { name: string; args: Record<string, unknown> }
          if (typeof call.name === 'string' && call.args && typeof call.args === 'object') {
            console.log(`[SwarmService] Agent ${agentId} (${role}) — executing tool: ${call.name}`)
            const result = await mcpService.executeTool(call.name, call.args)
            const resultStr = `[Tool: ${call.name}] Result: ${JSON.stringify(result).slice(0, 500)}`
            toolResults.push(resultStr)
            console.log(`[SwarmService] ${resultStr}`)
          }
        } catch (err) {
          console.error(`[SwarmService] Tool call failed:`, err)
          toolResults.push(`[Tool: error] ${String(err).slice(0, 200)}`)
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
      memory.store({
        type: 'episodic',
        content: fullContent,
        source: `${agentId}:${role}`,
      })
    } catch (err) {
      console.warn(`[SwarmService] memory.store failed for agent ${agentId}:`, err)
    }

    // Role-specific outcome evaluation
    if (role === 'reviewer') {
      const rejectionKeywords = ['reject', 'incorrect', 'wrong', 'fail', 'bug', 'error', 'broken']
      const lower = response.toLowerCase()
      state.reviewPassed = !rejectionKeywords.some((kw) => lower.includes(kw))
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

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'swarm:create': (_event: any, config: SwarmConfig, name?: string) =>
        this.createSession(config, name),

      'swarm:start': (_event: any, session: SwarmSession) => {
        const found = this.getSession(session.id)
        if (found) {
          this.startSession(session.id).catch(console.error)
          return found
        }
        return null
      },

      'swarm:stop': (_event: any, sessionId: string) =>
        this.stopSession(sessionId),

      'swarm:getState': (_event: any, sessionId: string) =>
        this.getSession(sessionId)?.state ?? null,

      'swarm:list': () => this.listSessions(),
      'swarm:listSessions': () => this.listSessions(),
      'swarm:getSession': (_event: any, id: string) => this.getSession(id),
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
