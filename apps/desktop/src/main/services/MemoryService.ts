import crypto from 'crypto'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import type { DatabaseService } from './DatabaseService.js'

type MemoryType = 'episodic' | 'semantic' | 'procedural' | 'working'

interface MemoryEntry {
  id: string
  type: MemoryType
  content: string
  embedding?: number[]
  source?: string
  createdAt: number
  updatedAt: number
  relevanceScore?: number
}

interface MemorySearchResult {
  entry: MemoryEntry
  similarity: number
}

export class MemoryService {
  private db!: DatabaseService

  init(): void {
    const registry = ServiceRegistry.getInstance()
    this.db = registry.resolve<DatabaseService>(SERVICE_TOKENS.DB)
    registry.register(SERVICE_TOKENS.MemoryService, this)
  }

  store(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>): MemoryEntry {
    const id = crypto.randomUUID()
    const now = Date.now()

    const stmt = this.db.getDb().prepare(`
      INSERT INTO memory_entries (id, type, content, embedding_json, source, created_at, updated_at, relevance_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      entry.type,
      entry.content,
      entry.embedding != null ? JSON.stringify(entry.embedding) : null,
      entry.source ?? null,
      now,
      now,
      entry.relevanceScore ?? null
    )

    return {
      id,
      type: entry.type,
      content: entry.content,
      embedding: entry.embedding,
      source: entry.source,
      createdAt: now,
      updatedAt: now,
      relevanceScore: entry.relevanceScore,
    }
  }

  search(query: string, limit: number = 10): MemorySearchResult[] {
    const rows = this.db.getDb().prepare(`
      SELECT * FROM memory_entries WHERE content LIKE ? LIMIT ?
    `).all(`%${query}%`, limit) as any[]

    return rows.map((row) => ({
      entry: this.rowToEntry(row),
      similarity: 1.0,
    }))
  }

  delete(id: string): void {
    this.db.getDb().prepare(`DELETE FROM memory_entries WHERE id = ?`).run(id)
  }

  private rowToEntry(row: any): MemoryEntry {
    return {
      id: row.id,
      type: row.type as MemoryType,
      content: row.content,
      embedding: row.embedding_json != null ? JSON.parse(row.embedding_json) : undefined,
      source: row.source ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      relevanceScore: row.relevance_score ?? undefined,
    }
  }

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'memory:add': (_event: any, entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>) =>
        this.store(entry),
      'memory:search': (
        _event: any,
        payload: { query: string; type?: string; limit?: number }
      ) => this.search(payload.query, payload.limit),
      'memory:store': (_event: any, entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>) =>
        this.store(entry),
      'memory:delete': (_event: any, id: string) => this.delete(id),
    }
  }
}
