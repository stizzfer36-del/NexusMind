import crypto from 'crypto'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import { WindowManager } from '../windows/WindowManager.js'
import { ModelProvider, ModelCapability } from '@nexusmind/shared'
import type { ModelConfig, StreamChunk, AgentMessage } from '@nexusmind/shared'
import type { KanbanService } from './KanbanService.js'
import type { ModelRouter } from './ModelRouter.js'
import type { MemoryService } from './MemoryService.js'

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

const ROLE_PROMPTS: Record<AgentRole, string> = {
  coordinator: 'You are the coordinator agent. Analyze the task and produce a clear, actionable implementation plan.',
  builder:     'You are the builder agent. Write clean, working code to implement the described task.',
  reviewer:    'You are the reviewer agent. Review the task output for correctness, bugs, and suggest improvements.',
  tester:      'You are the tester agent. Write tests or describe how to test the described feature.',
  docwriter:   'You are the docwriter agent. Write clear documentation or a summary for the described task.',
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

    // --- Phase 1: ORCHESTRATING ---
    session.state.status = SwarmStatus.ORCHESTRATING
    session.state.currentRound = 0
    session.state.consensusReached = false
    session.updatedAt = Date.now()
    this.push('swarm:update', { id, state: session.state })
    console.log(`[SwarmService] Session ${id} — orchestrating (${session.config.maxAgents} agents)`)

    // Assign agent IDs, cycling through roles
    const agentCount = Math.max(1, session.config.maxAgents)
    const agentIds: string[] = Array.from({ length: agentCount }, () => crypto.randomUUID())
    session.state.agentIds = agentIds
    session.updatedAt = Date.now()

    // Reset cancel flag
    this.cancelFlags.set(id, false)

    // Create initial kanban tasks for this session
    try {
      const kanban = registry.resolve<KanbanService>(SERVICE_TOKENS.KanbanService)
      const sessionName = session.name
      ;(kanban as any).bulkCreate([
        { title: `Plan: ${sessionName}`,      description: `Planning phase for session: ${sessionName}`,      column: 'backlog', priority: 'medium' },
        { title: `Implement: ${sessionName}`, description: `Implementation phase for session: ${sessionName}`, column: 'backlog', priority: 'medium' },
        { title: `Review: ${sessionName}`,    description: `Review phase for session: ${sessionName}`,         column: 'backlog', priority: 'medium' },
      ])
    } catch (err) {
      console.warn('[SwarmService] bulkCreate failed (KanbanService may not support it yet):', err)
    }

    // --- Phase 2: EXECUTING ---
    session.state.status = SwarmStatus.EXECUTING
    session.updatedAt = Date.now()
    this.push('swarm:update', { id, state: session.state })
    console.log(`[SwarmService] Session ${id} — executing`)

    // Spin up per-agent loops concurrently
    const modelConfig: ModelConfig = { ...DEFAULT_MODEL_CONFIG }

    try {
      await Promise.all(
        agentIds.map((agentId, i) => {
          const role = AGENT_ROLES[i % AGENT_ROLES.length]
          return this.runAgent(id, agentId, role, modelConfig)
        }),
      )
    } catch (err) {
      console.error(`[SwarmService] Session ${id} — unexpected error in agent pool:`, err)
      // Don't rethrow; still mark completed so UI doesn't hang
    }

    // --- Phase 3: COMPLETED ---
    if (!this.cancelFlags.get(id)) {
      session.state.status = SwarmStatus.COMPLETED
      session.state.consensusReached = true
    }
    session.updatedAt = Date.now()
    this.push('swarm:update', { id, state: session.state })
    console.log(`[SwarmService] Session ${id} — ${session.state.status}`)
  }

  // -------------------------------------------------------------------------
  // runAgent — per-agent task loop
  // -------------------------------------------------------------------------

  private async runAgent(
    sessionId: string,
    agentId: string,
    role: AgentRole,
    modelConfig: ModelConfig,
  ): Promise<void> {
    const registry = ServiceRegistry.getInstance()
    const session = this.sessions.get(sessionId)
    if (!session) return

    const maxRounds = session.config.maxRounds

    for (let round = 0; round < maxRounds; round++) {
      // Check for cancellation before each task
      if (this.cancelFlags.get(sessionId)) {
        console.log(`[SwarmService] Agent ${agentId} (${role}) — cancelled`)
        return
      }

      // Lazily resolve services on each iteration (safe after init order)
      let kanban: KanbanService
      let modelRouter: ModelRouter
      let memory: MemoryService
      try {
        kanban      = registry.resolve<KanbanService>(SERVICE_TOKENS.KanbanService)
        modelRouter = registry.resolve<ModelRouter>(SERVICE_TOKENS.ModelRouter)
        memory      = registry.resolve<MemoryService>(SERVICE_TOKENS.MemoryService)
      } catch (err) {
        console.error(`[SwarmService] Agent ${agentId} — failed to resolve services:`, err)
        return
      }

      // Get the next available task for this role
      const task = (kanban as any).getNextTask(role) as { id: string; title: string; description: string } | null
      if (!task) {
        // No more tasks for this role — agent is done
        console.log(`[SwarmService] Agent ${agentId} (${role}) — no more tasks, stopping`)
        break
      }

      // Assign task to this agent
      try {
        ;(kanban as any).assignToAgent(task.id, agentId)
      } catch (err) {
        console.warn(`[SwarmService] assignToAgent failed for task ${task.id}:`, err)
      }

      // Build the message to send to the model
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

      // Stream response from model router, accumulating full content
      let response = ''
      try {
        for await (const chunk of modelRouter.route(modelConfig, messages)) {
          if (chunk.content) {
            response += chunk.content
          }
          if (chunk.isDone) break
        }
      } catch (err) {
        console.error(`[SwarmService] Agent ${agentId} (${role}) — model error on task "${task.title}":`, err)
        // Continue to next task — resilient loop
        await this._delay(500)
        continue
      }

      // Mark task complete in kanban
      try {
        kanban.updateTask(task.id, { column: 'done', assignee: agentId })
      } catch (err) {
        console.warn(`[SwarmService] updateTask failed for task ${task.id}:`, err)
      }

      // Persist to memory
      try {
        memory.store({
          type: 'episodic',
          content: response,
          source: agentId,
        })
      } catch (err) {
        console.warn(`[SwarmService] memory.store failed for agent ${agentId}:`, err)
      }

      // Push the response (truncated) into the session message log
      const truncated = response.length > 500 ? `${response.slice(0, 500)}…` : response
      session.state.messages.push(truncated)
      session.state.currentRound += 1
      session.updatedAt = Date.now()

      // Notify renderer of updated state
      this.push('swarm:update', { id: sessionId, state: session.state })

      // Brief inter-task pause to avoid hammering the API
      await this._delay(500)
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
