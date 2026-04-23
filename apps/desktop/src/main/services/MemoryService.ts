import crypto from 'crypto'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import type { DatabaseService } from './DatabaseService.js'
import type { EmbeddingService } from './EmbeddingProvider.js'
import type { MCPToolDefinition, MCPToolCallResult } from '@nexusmind/shared'

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
  private idfCache: Map<string, number> | null = null
  private documentCount = 0
  private termDocumentFreq = new Map<string, number>()
  private idfCacheDirty = true

  init(): void {
    const registry = ServiceRegistry.getInstance()
    this.db = registry.resolve<DatabaseService>(SERVICE_TOKENS.DB)
    this.ensureIDFTable()
    this.loadIDFCache()
    registry.register(SERVICE_TOKENS.MemoryService, this)
  }

  private ensureIDFTable(): void {
    this.db.getDb().exec(`
      CREATE TABLE IF NOT EXISTS memory_idf_cache (
        term TEXT PRIMARY KEY,
        idf_value REAL NOT NULL,
        doc_freq INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memory_idf ON memory_idf_cache(term);
    `)
  }

  private loadIDFCache(): void {
    try {
      const rows = this.db.getDb()
        .prepare('SELECT term, idf_value, doc_freq FROM memory_idf_cache')
        .all() as Array<{ term: string; idf_value: number; doc_freq: number }>

      if (rows.length > 0) {
        this.idfCache = new Map(rows.map(r => [r.term, r.idf_value]))
        this.termDocumentFreq = new Map(rows.map(r => [r.term, r.doc_freq]))
        this.documentCount = (this.db.getDb()
          .prepare('SELECT COUNT(*) as cnt FROM memory_entries')
          .get() as { cnt: number }).cnt
        this.idfCacheDirty = false
      }
    } catch {
      this.idfCache = null
      this.idfCacheDirty = true
    }
  }

  private saveIDFCache(): void {
    if (!this.idfCache || !this.idfCacheDirty) return

    const db = this.db.getDb()
    const insert = db.prepare(`
      INSERT OR REPLACE INTO memory_idf_cache (term, idf_value, doc_freq)
      VALUES (?, ?, ?)
    `)

    const insertAll = db.transaction(() => {
      for (const [term, idf] of this.idfCache!) {
        const docFreq = this.termDocumentFreq.get(term) || 1
        insert.run(term, idf, docFreq)
      }
    })

    insertAll()
    this.idfCacheDirty = false
  }

  private async updateIDFIncrementally(newContent: string): Promise<void> {
    const tokens = new Set(tokenize(newContent))

    if (this.idfCache === null) {
      await this.rebuildIDFCache()
      return
    }

    this.documentCount++

    for (const term of tokens) {
      const currentFreq = this.termDocumentFreq.get(term) || 0
      this.termDocumentFreq.set(term, currentFreq + 1)

      const idf = Math.log((this.documentCount + 1) / (currentFreq + 1 + 1)) + 1
      this.idfCache.set(term, idf)
    }

    this.idfCacheDirty = true

    if (this.documentCount % 100 === 0) {
      this.saveIDFCache()
    }
  }

  private async rebuildIDFCache(): Promise<void> {
    const entries = this.db.getDb()
      .prepare('SELECT content FROM memory_entries')
      .all() as Array<{ content: string }>

    const corpus = entries.map(e => e.content)
    this.documentCount = corpus.length

    const df = new Map<string, number>()
    for (const doc of corpus) {
      const terms = new Set(tokenize(doc))
      for (const term of terms) {
        df.set(term, (df.get(term) || 0) + 1)
      }
    }

    this.idfCache = new Map()
    this.termDocumentFreq = new Map(df)

    for (const [term, count] of df) {
      const idf = Math.log((this.documentCount + 1) / (count + 1)) + 1
      this.idfCache.set(term, idf)
    }

    this.idfCacheDirty = true
    this.saveIDFCache()
  }

  async store(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryEntry> {
    const id = crypto.randomUUID()
    const now = Date.now()
    const database = this.db.getDb()

    let embeddingJson: string
    let usedSemantic = false

    // Try semantic embedding provider first
    try {
      const embeddingService = ServiceRegistry.getInstance().resolve<EmbeddingService>(SERVICE_TOKENS.EmbeddingProvider)
      if (embeddingService.isAvailable()) {
        const vector = await embeddingService.embed(entry.content)
        embeddingJson = JSON.stringify(vector)
        usedSemantic = true
      } else {
        throw new Error('Embedding service not available')
      }
    } catch (err) {
      // Fall back to TF-IDF
      const existingRows = database
        .prepare(`SELECT content FROM memory_entries`)
        .all() as Array<{ content: string }>
      const corpus = existingRows.map((r) => r.content).concat(entry.content)

      const tokens = tokenize(entry.content)
      const tf = computeTF(tokens)
      const idf = computeIDF(corpus)
      const tfidfVec = buildTFIDF(tf, idf)
      embeddingJson = JSON.stringify(mapToRecord(tfidfVec))

      if (process.env.NODE_ENV === 'development') {
        console.log('[MemoryService] Using TF-IDF fallback (semantic embeddings unavailable):', err)
      }
    }

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

    await this.updateIDFIncrementally(entry.content)

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

  async search(query: string, limit: number = 10, type?: string): Promise<MemorySearchResult[]> {
    const database = this.db.getDb()

    // Try to get semantic embedding for query
    let queryVector: number[] | null = null
    let useSemantic = false
    try {
      const embeddingService = ServiceRegistry.getInstance().resolve<EmbeddingService>(SERVICE_TOKENS.EmbeddingProvider)
      if (embeddingService.isAvailable()) {
        queryVector = await embeddingService.embed(query)
        useSemantic = true
      }
    } catch {
      // Will fall back to TF-IDF
    }

    // Build TF-IDF vector as fallback
    let queryTFIDF: Map<string, number> | null = null
    if (!useSemantic) {
      const existingRows = database
        .prepare(`SELECT content FROM memory_entries`)
        .all() as Array<{ content: string }>
      const corpus = existingRows.map((r) => r.content)
      const idf = computeIDF(corpus.concat(query))
      const queryTokens = tokenize(query)
      const queryTF = computeTF(queryTokens)
      queryTFIDF = buildTFIDF(queryTF, idf)
    }

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
          const vec = JSON.parse(row.embedding_json) as number[]
          if (useSemantic && queryVector && Array.isArray(vec) && vec.length > 100) {
            // Semantic embedding comparison
            similarity = this.cosineSimilarityVectors(queryVector, vec)
          } else {
            // TF-IDF comparison
            const vecMap = recordToMap(vec as unknown as Record<string, number>)
            similarity = cosineSimilarity(queryTFIDF!, vecMap)
          }
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

  private cosineSimilarityVectors(a: number[], b: number[]): number {
    const minLen = Math.min(a.length, b.length)
    let dotProduct = 0
    let normA = 0
    let normB = 0
    
    for (let i = 0; i < minLen; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    
    if (normA === 0 || normB === 0) return 0
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }

  delete(id: string): void {
    this.db.getDb().prepare(`DELETE FROM memory_entries WHERE id = ?`).run(id)
  }

  listMemories(type?: string): MemoryEntry[] {
    const database = this.db.getDb()
    const rows = (
      type != null
        ? (database
            .prepare(`SELECT * FROM memory_entries WHERE type = ? ORDER BY created_at DESC`)
            .all(type) as any[])
        : (database
            .prepare(`SELECT * FROM memory_entries ORDER BY created_at DESC`)
            .all() as any[])
    )
    return rows.map((row) => this.rowToEntry(row))
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

  exposeAsMCPTool(): MCPToolDefinition {
    return {
      name: 'nexusmind_memory',
      description: 'Query and store persistent memory across sessions',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query for memory entries' },
          store: {
            type: 'object',
            description: 'Store a new memory entry',
            properties: {
              key: { type: 'string', description: 'Unique key for the memory entry' },
              value: { type: 'string', description: 'Content to store' },
            },
            required: ['key', 'value'],
          },
        },
        required: ['query'],
      },
    }
  }

  async handleMCPCall(input: {
    query?: string
    store?: { key: string; value: string }
  }): Promise<MCPToolCallResult> {
    try {
      if (input.store) {
        await this.store({
          type: 'semantic',
          content: `${input.store.key}: ${input.store.value}`,
          source: 'mcp',
        })
        return { success: true, output: 'Memory stored successfully' }
      }

      if (input.query) {
        const results = await this.search(input.query, 5)
        return { success: true, output: JSON.stringify(results) }
      }

      return { success: false, error: 'Missing query or store parameter' }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'memory:add': (_event: any, entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>) =>
        this.store(entry),
      'memory:search': async (
        _event: any,
        payload: { query: string; type?: string; limit?: number }
      ) => this.search(payload.query, payload.limit ?? 10, payload.type),
      'memory:store': (_event: any, entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>) =>
        this.store(entry),
      'memory:delete': (_event: any, id: string) => this.delete(id),
      'memory:list': (_event: any, type?: string) => this.listMemories(type),
      'memory:mcpExpose': () => this.exposeAsMCPTool(),
      'memory:mcpStatus': () => ({ exposed: true, toolName: 'nexusmind_memory' }),
    }
  }
}
