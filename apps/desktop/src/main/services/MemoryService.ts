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

// ---------------------------------------------------------------------------
// TF-IDF helpers (pure JS, no external packages)
// ---------------------------------------------------------------------------

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
}

function computeTF(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>()
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1)
  for (const [t, count] of freq) freq.set(t, count / tokens.length)
  return freq
}

function computeIDF(corpus: string[]): Map<string, number> {
  const N = corpus.length
  const df = new Map<string, number>()
  for (const doc of corpus) {
    const terms = new Set(tokenize(doc))
    for (const term of terms) {
      df.set(term, (df.get(term) ?? 0) + 1)
    }
  }
  const idf = new Map<string, number>()
  for (const [term, count] of df) {
    idf.set(term, Math.log((N + 1) / (count + 1)) + 1)
  }
  return idf
}

function buildTFIDF(tf: Map<string, number>, idf: Map<string, number>): Map<string, number> {
  const vec = new Map<string, number>()
  for (const [term, tfVal] of tf) {
    const idfVal = idf.get(term) ?? Math.log((1 + 1) / (0 + 1)) + 1
    vec.set(term, tfVal * idfVal)
  }
  return vec
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, normA = 0, normB = 0
  for (const [t, va] of a) {
    const vb = b.get(t) ?? 0
    dot += va * vb
    normA += va * va
  }
  for (const [, vb] of b) normB += vb * vb
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

function recordToMap(obj: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(obj))
}

function mapToRecord(m: Map<string, number>): Record<string, number> {
  return Object.fromEntries(m)
}

// ---------------------------------------------------------------------------

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
    const database = this.db.getDb()

    // Fetch all existing contents to compute IDF (include new content in corpus)
    const existingRows = database
      .prepare(`SELECT content FROM memory_entries`)
      .all() as Array<{ content: string }>
    const corpus = existingRows.map((r) => r.content).concat(entry.content)

    // Build TF-IDF vector for the new content
    const tokens = tokenize(entry.content)
    const tf = computeTF(tokens)
    const idf = computeIDF(corpus)
    const tfidfVec = buildTFIDF(tf, idf)
    const embeddingJson = JSON.stringify(mapToRecord(tfidfVec))

    database
      .prepare(
        `INSERT INTO memory_entries (id, type, content, embedding_json, source, created_at, updated_at, relevance_score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        entry.type,
        entry.content,
        embeddingJson,
        entry.source ?? null,
        now,
        now,
        entry.relevanceScore ?? null
      )

    // Pruning: if count exceeds 10 000, remove the oldest 500 entries
    const { cnt } = database
      .prepare(`SELECT COUNT(*) as cnt FROM memory_entries`)
      .get() as { cnt: number }
    if (cnt > 10000) {
      database
        .prepare(
          `DELETE FROM memory_entries WHERE id IN (
             SELECT id FROM memory_entries ORDER BY created_at ASC LIMIT 500
           )`
        )
        .run()
    }

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

  search(query: string, limit: number = 10, type?: string): MemorySearchResult[] {
    const database = this.db.getDb()

    // Build query TF-IDF vector
    const existingRows = database
      .prepare(`SELECT content FROM memory_entries`)
      .all() as Array<{ content: string }>
    const corpus = existingRows.map((r) => r.content)
    const idf = computeIDF(corpus.concat(query))
    const queryTokens = tokenize(query)
    const queryTF = computeTF(queryTokens)
    const queryVec = buildTFIDF(queryTF, idf)

    // Fetch entries, optionally filtered by type
    const rows = (
      type != null
        ? (database
            .prepare(`SELECT * FROM memory_entries WHERE type = ?`)
            .all(type) as any[])
        : (database.prepare(`SELECT * FROM memory_entries`).all() as any[])
    )

    // Score each entry via cosine similarity
    const scored: MemorySearchResult[] = rows.map((row) => {
      let similarity = 0
      if (row.embedding_json != null) {
        try {
          const vec = recordToMap(JSON.parse(row.embedding_json) as Record<string, number>)
          similarity = cosineSimilarity(queryVec, vec)
        } catch {
          // Malformed JSON — fall back to substring presence
          similarity = (row.content as string).toLowerCase().includes(query.toLowerCase()) ? 0.01 : 0
        }
      } else {
        // No embedding — fall back to substring presence
        similarity = (row.content as string).toLowerCase().includes(query.toLowerCase()) ? 0.01 : 0
      }
      return { entry: this.rowToEntry(row), similarity }
    })

    // Sort descending by similarity, return top `limit`
    scored.sort((a, b) => b.similarity - a.similarity)
    return scored.slice(0, limit)
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
      ) => this.search(payload.query, payload.limit ?? 10, payload.type),
      'memory:store': (_event: any, entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>) =>
        this.store(entry),
      'memory:delete': (_event: any, id: string) => this.delete(id),
    }
  }
}
