import crypto from 'crypto'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'

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

interface AgentMessage {
  id: string
  agentId: string
  role: string
  content: string
  timestamp: number
  metadata?: Record<string, unknown>
}

interface SwarmState {
  status: SwarmStatus
  currentRound: number
  agentIds: string[]
  messages: AgentMessage[]
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
// SwarmService
// ---------------------------------------------------------------------------

export class SwarmService {
  private sessions: Map<string, SwarmSession> = new Map()

  init(): void {
    ServiceRegistry.getInstance().register(SERVICE_TOKENS.SwarmService, this)
  }

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

  getSession(id: string): SwarmSession | null {
    return this.sessions.get(id) ?? null
  }

  async startSession(id: string): Promise<void> {
    console.log(`[SwarmService] Starting session ${id}`)
    const session = this.sessions.get(id)
    if (!session) return

    session.state.status = SwarmStatus.EXECUTING
    session.updatedAt = Date.now()

    await new Promise(r => setTimeout(r, 100))

    session.state.status = SwarmStatus.COMPLETED
    session.updatedAt = Date.now()
    console.log(`[SwarmService] Session ${id} done`)
  }

  stopSession(id: string): void {
    const session = this.sessions.get(id)
    if (!session) return
    session.state.status = SwarmStatus.IDLE
    session.updatedAt = Date.now()
  }

  listSessions(): SwarmSession[] {
    return [...this.sessions.values()]
  }

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'swarm:start': (event: any, config: SwarmSession) =>
        this.startSession(config.id).then(() => config),
      'swarm:stop': (event: any, sessionId: string) =>
        this.stopSession(sessionId),
      'swarm:getState': (event: any, sessionId: string) =>
        this.getSession(sessionId)?.state ?? null,
      'swarm:create': (event: any, config: SwarmConfig, name?: string) =>
        this.createSession(config, name),
      'swarm:list': () => this.listSessions(),
      'swarm:listSessions': () => this.listSessions(),
      'swarm:getSession': (event: any, id: string) => this.getSession(id),
    }
  }
}
