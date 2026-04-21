import crypto from 'crypto'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import type { DatabaseService } from './DatabaseService.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReplayEventType =
  | 'graph:transition'
  | 'agent:output'
  | 'tool:call'
  | 'tool:result'
  | 'kanban:move'
  | 'memory:store'
  | 'pty:chunk'
  | 'session:start'
  | 'session:end'

export interface ReplayEvent {
  id: string
  sessionId: string
  type: ReplayEventType
  timestamp: number
  nodeId?: string
  agentId?: string
  payload: Record<string, unknown>
  durationMs?: number
}

export interface ReplaySession {
  id: string
  name: string
  startedAt: number
  endedAt?: number
  eventCount: number
  nodeTransitions: number
  toolCallCount: number
}

// ---------------------------------------------------------------------------
// EventRecorder
// ---------------------------------------------------------------------------

export class EventRecorder {
  private db!: DatabaseService

  init(): void {
    const registry = ServiceRegistry.getInstance()
    this.db = registry.resolve<DatabaseService>(SERVICE_TOKENS.DB)

    // Create tables
    this.db.getDb().exec(`
      CREATE TABLE IF NOT EXISTS replay_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        node_id TEXT,
        agent_id TEXT,
        payload TEXT NOT NULL,
        duration_ms INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_replay_session
        ON replay_events(session_id, timestamp ASC);
      CREATE TABLE IF NOT EXISTS replay_sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        started_at INTEGER NOT NULL
      );
    `)

    registry.register('EventRecorder', this)
  }

  record(event: Omit<ReplayEvent, 'id' | 'timestamp'>): ReplayEvent {
    const full: ReplayEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...event,
    }
    try {
      this.db.getDb().prepare(
        `INSERT INTO replay_events (id, session_id, type, timestamp, node_id, agent_id, payload, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        full.id,
        full.sessionId,
        full.type,
        full.timestamp,
        full.nodeId ?? null,
        full.agentId ?? null,
        JSON.stringify(full.payload),
        full.durationMs ?? null,
      )
    } catch (err) {
      console.warn('[EventRecorder] record failed:', err)
    }
    return full
  }

  getEvents(sessionId: string): ReplayEvent[] {
    try {
      const rows = this.db.getDb().prepare(
        `SELECT * FROM replay_events WHERE session_id = ? ORDER BY timestamp ASC`
      ).all(sessionId) as any[]
      return rows.map(r => ({
        id: r.id,
        sessionId: r.session_id,
        type: r.type as ReplayEventType,
        timestamp: r.timestamp,
        nodeId: r.node_id ?? undefined,
        agentId: r.agent_id ?? undefined,
        payload: JSON.parse(r.payload),
        durationMs: r.duration_ms ?? undefined,
      }))
    } catch (err) {
      console.warn('[EventRecorder] getEvents failed:', err)
      return []
    }
  }

  getSessions(): ReplaySession[] {
    try {
      const rows = this.db.getDb().prepare(`
        SELECT
          rs.id AS session_id,
          rs.name,
          rs.started_at,
          COUNT(re.id) AS event_count,
          SUM(CASE WHEN re.type = 'graph:transition' THEN 1 ELSE 0 END) AS node_transitions,
          SUM(CASE WHEN re.type = 'tool:call' THEN 1 ELSE 0 END) AS tool_calls,
          MAX(re.timestamp) AS ended_at
        FROM replay_sessions rs
        LEFT JOIN replay_events re ON re.session_id = rs.id
        GROUP BY rs.id
        ORDER BY rs.started_at DESC
      `).all() as any[]

      return rows.map(r => ({
        id: r.session_id,
        name: r.name,
        startedAt: r.started_at,
        endedAt: r.ended_at ?? undefined,
        eventCount: r.event_count ?? 0,
        nodeTransitions: r.node_transitions ?? 0,
        toolCallCount: r.tool_calls ?? 0,
      }))
    } catch (err) {
      console.warn('[EventRecorder] getSessions failed:', err)
      return []
    }
  }

  startSession(sessionId: string, name: string): void {
    try {
      this.db.getDb().prepare(
        `INSERT OR IGNORE INTO replay_sessions (id, name, started_at) VALUES (?, ?, ?)`
      ).run(sessionId, name, Date.now())
    } catch (err) {
      console.warn('[EventRecorder] startSession failed:', err)
    }
    this.record({ sessionId, type: 'session:start', payload: { name } })
  }

  endSession(sessionId: string): void {
    this.record({ sessionId, type: 'session:end', payload: {} })
  }

  deleteSession(sessionId: string): void {
    try {
      this.db.getDb().prepare(`DELETE FROM replay_events WHERE session_id = ?`).run(sessionId)
      this.db.getDb().prepare(`DELETE FROM replay_sessions WHERE id = ?`).run(sessionId)
    } catch (err) {
      console.warn('[EventRecorder] deleteSession failed:', err)
    }
  }

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'replay:getSessions': () => this.getSessions(),
      'replay:getEvents': (_event: any, sessionId: string) => this.getEvents(sessionId),
      'replay:deleteSession': (_event: any, sessionId: string) => this.deleteSession(sessionId),
    }
  }
}
