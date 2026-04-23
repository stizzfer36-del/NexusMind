import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import type { DatabaseService } from './DatabaseService.js'
import type { EmbeddingService } from './EmbeddingProvider.js'
import * as fs from 'node:fs'
import * as path from 'node:path'

// ---------------------------------------------------------------------------
// CodebaseIndexService - Refactored with Incremental Indexing & File Watching
// ---------------------------------------------------------------------------
// This service provides fast, semantic search over the codebase using:
//   • Incremental indexing (only changed files are re-indexed)
//   • Real-time file watching (chokidar for automatic updates)
//   • Semantic embeddings (via EmbeddingService with fallback to TF-IDF)
//   • Cached IDF statistics (no full-scan on every query)
//   • Persistent index in SQLite (survives restarts)
// ---------------------------------------------------------------------------

interface CodebaseFile {
  id: string
  path: string
  content: string
  language: string
  embedding: number[]
  lastModified: number
  indexedAt: number
}

interface SearchResult {
  file: CodebaseFile
  similarity: number
}

interface IndexCache {
  idf: Map<string, number>
  totalDocs: number
  lastUpdated: number
}

const SUPPORTED_EXTENSIONS: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.cpp': 'cpp',
  '.c': 'c',
  '.h': 'c',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.md': 'markdown',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.sql': 'sql',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
}

const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  'coverage',
  '.coverage',
  '__pycache__',
  '.pytest_cache',
  '*.min.js',
  '*.min.css',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.DS_Store',
  'Thumbs.db',
]

export class CodebaseIndexService {
  private db!: DatabaseService
  private embeddingService: EmbeddingService | null = null
  private workspaceRoot: string = ''
  private isIndexing: boolean = false
  private indexProgress: { total: number; current: number } = { total: 0, current: 0 }
  private idfCache: IndexCache | null = null
  private fileWatcher: any = null
  private pendingUpdates: Set<string> = new Set()
  private updateTimeout: ReturnType<typeof setTimeout> | null = null

  init(): void {
    const registry = ServiceRegistry.getInstance()
    this.db = registry.resolve<DatabaseService>(SERVICE_TOKENS.DB)
    this.ensureTables()
    
    try {
      this.embeddingService = registry.resolve<EmbeddingService>(SERVICE_TOKENS.EmbeddingProvider)
    } catch {
      console.log('[CodebaseIndexService] EmbeddingService not available, using TF-IDF fallback')
    }

    try {
      const settings = registry.resolve<any>(SERVICE_TOKENS.Settings)
      this.workspaceRoot = settings.get('workspaceRoot', process.cwd())
    } catch {
      this.workspaceRoot = process.cwd()
    }

    registry.register(SERVICE_TOKENS.CodebaseIndex, this)
    
    // Load cached IDF on init
    this.loadIDFCache()
    
    // Setup file watching if chokidar is available
    this.setupFileWatching()
    
    console.log('[CodebaseIndexService] Initialized with incremental indexing')
  }

  private ensureTables(): void {
    this.db.getDb().exec(`
      CREATE TABLE IF NOT EXISTS codebase_index (
        id TEXT PRIMARY KEY,
        path TEXT UNIQUE NOT NULL,
        content TEXT NOT NULL,
        language TEXT,
        embedding_json TEXT,
        last_modified INTEGER NOT NULL,
        indexed_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_codebase_language ON codebase_index(language);
      CREATE INDEX IF NOT EXISTS idx_codebase_path ON codebase_index(path);
      CREATE INDEX IF NOT EXISTS idx_codebase_modified ON codebase_index(last_modified);
      
      CREATE TABLE IF NOT EXISTS codebase_index_metadata (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `)
  }

  // -------------------------------------------------------------------------
  // Incremental IDF Caching
  // -------------------------------------------------------------------------

  private loadIDFCache(): void {
    try {
      const row = this.db.getDb()
        .prepare("SELECT value FROM codebase_index_metadata WHERE key = 'idf_cache'")
        .get() as { value: string } | undefined
      
      if (row) {
        const parsed = JSON.parse(row.value)
        this.idfCache = {
          idf: new Map(Object.entries(parsed.idf)),
          totalDocs: parsed.totalDocs,
          lastUpdated: parsed.lastUpdated,
        }
      }
    } catch {
      this.idfCache = null
    }
  }

  private saveIDFCache(): void {
    if (!this.idfCache) return
    
    const cacheData = {
      idf: Object.fromEntries(this.idfCache.idf),
      totalDocs: this.idfCache.totalDocs,
      lastUpdated: Date.now(),
    }
    
    this.db.getDb()
      .prepare("INSERT OR REPLACE INTO codebase_index_metadata (key, value) VALUES ('idf_cache', ?)")
      .run(JSON.stringify(cacheData))
  }

  private async computeIncrementalIDF(): Promise<void> {
    const files = this.db.getDb()
      .prepare('SELECT content FROM codebase_index')
      .all() as Array<{ content: string }>
    
    const corpus = files.map(f => f.content)
    const N = corpus.length
    const df = new Map<string, number>()
    
    for (const doc of corpus) {
      const terms = new Set(this.tokenize(doc))
      for (const term of terms) {
        df.set(term, (df.get(term) ?? 0) + 1)
      }
    }
    
    const idf = new Map<string, number>()
    for (const [term, count] of df) {
      idf.set(term, Math.log((N + 1) / (count + 1)) + 1)
    }
    
    this.idfCache = {
      idf,
      totalDocs: N,
      lastUpdated: Date.now(),
    }
    
    this.saveIDFCache()
  }

  // -------------------------------------------------------------------------
  // File Watching (chokidar)
  // -------------------------------------------------------------------------

  private async setupFileWatching(): Promise<void> {
    if (!this.workspaceRoot) return
    
    try {
      const chokidar = await import('chokidar')
      
      const watcher = chokidar.watch(this.workspaceRoot, {
        ignored: [
          /node_modules/,
          /\.git/,
          /dist/,
          /build/,
          /out/,
          /\.(min\.(js|css))$/,
        ],
        persistent: true,
        ignoreInitial: true,
      })
      
      watcher
        .on('add', (filePath: string) => this.handleFileChange(filePath))
        .on('change', (filePath: string) => this.handleFileChange(filePath))
        .on('unlink', (filePath: string) => this.handleFileDelete(filePath))
      
      this.fileWatcher = watcher
      console.log('[CodebaseIndexService] File watching enabled (chokidar)')
    } catch {
      console.log('[CodebaseIndexService] chokidar not available, file watching disabled')
    }
  }

  private handleFileChange(filePath: string): void {
    const relativePath = path.relative(this.workspaceRoot, filePath)
    const ext = path.extname(filePath).toLowerCase()
    
    if (!SUPPORTED_EXTENSIONS[ext]) return
    if (this.shouldIgnore(relativePath)) return
    
    this.pendingUpdates.add(relativePath)
    
    // Debounce batch updates
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout)
    }
    
    this.updateTimeout = setTimeout(() => {
      this.processPendingUpdates()
    }, 1000)
  }

  private handleFileDelete(filePath: string): void {
    const relativePath = path.relative(this.workspaceRoot, filePath)
    
    this.db.getDb()
      .prepare('DELETE FROM codebase_index WHERE path = ?')
      .run(relativePath)
    
    this.pendingUpdates.delete(relativePath)
  }

  private async processPendingUpdates(): Promise<void> {
    if (this.pendingUpdates.size === 0) return
    
    console.log(`[CodebaseIndexService] Processing ${this.pendingUpdates.size} file updates...`)
    
    const updates = Array.from(this.pendingUpdates)
    this.pendingUpdates.clear()
    
    for (const relativePath of updates) {
      const fullPath = path.join(this.workspaceRoot, relativePath)
      
      if (fs.existsSync(fullPath)) {
        await this.indexFile({ path: relativePath, fullPath })
      }
    }
    
    await this.computeIncrementalIDF()
  }

  // -------------------------------------------------------------------------
  // Indexing
  // -------------------------------------------------------------------------

  async indexWorkspace(onProgress?: (progress: { total: number; current: number }) => void): Promise<void> {
    if (this.isIndexing) {
      throw new Error('Indexing already in progress')
    }

    this.isIndexing = true
    this.indexProgress = { total: 0, current: 0 }

    try {
      const files = this.findSourceFiles(this.workspaceRoot)
      this.indexProgress.total = files.length
      
      console.log(`[CodebaseIndexService] Indexing ${files.length} files...`)

      // Process in batches
      const batchSize = 10
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize)
        await Promise.all(batch.map(file => this.indexFile(file)))
        
        this.indexProgress.current = Math.min(i + batchSize, files.length)
        onProgress?.(this.indexProgress)
      }

      this.cleanupDeletedFiles(files.map(f => f.path))
      
      // Recompute IDF after full index
      await this.computeIncrementalIDF()
      
      console.log('[CodebaseIndexService] Indexing complete')
    } finally {
      this.isIndexing = false
    }
  }

  private findSourceFiles(dir: string): Array<{ path: string; fullPath: string }> {
    const files: Array<{ path: string; fullPath: string }> = []
    
    const walk = (currentDir: string) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true })
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name)
        const relativePath = path.relative(this.workspaceRoot, fullPath)
        
        if (this.shouldIgnore(relativePath)) {
          continue
        }
        
        if (entry.isDirectory()) {
          walk(fullPath)
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase()
          if (SUPPORTED_EXTENSIONS[ext]) {
            files.push({ path: relativePath, fullPath })
          }
        }
      }
    }
    
    walk(dir)
    return files
  }

  private shouldIgnore(relativePath: string): boolean {
    return IGNORE_PATTERNS.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'))
        return regex.test(relativePath)
      }
      return relativePath.includes(pattern)
    })
  }

  private async indexFile(file: { path: string; fullPath: string }): Promise<void> {
    try {
      const stats = fs.statSync(file.fullPath)
      const content = fs.readFileSync(file.fullPath, 'utf-8')
      const ext = path.extname(file.path).toLowerCase()
      const language = SUPPORTED_EXTENSIONS[ext] || 'plaintext'
      
      // Check if file needs re-indexing
      const existing = this.db.getDb()
        .prepare('SELECT last_modified FROM codebase_index WHERE path = ?')
        .get(file.path) as { last_modified: number } | undefined
      
      if (existing && existing.last_modified === stats.mtimeMs) {
        return
      }

      // Generate embedding
      let embedding: number[] = []
      
      if (this.embeddingService?.isAvailable()) {
        try {
          const chunks = this.chunkContent(content)
          const embeddings = await Promise.all(
            chunks.map(chunk => this.embeddingService!.embed(chunk))
          )
          embedding = this.averageEmbeddings(embeddings)
        } catch (err) {
          console.warn(`[CodebaseIndexService] Failed to embed ${file.path}:`, err)
          embedding = this.computeTFIDF(content)
        }
      } else {
        embedding = this.computeTFIDF(content)
      }

      const id = crypto.randomUUID()
      
      this.db.getDb().prepare(`
        INSERT OR REPLACE INTO codebase_index 
        (id, path, content, language, embedding_json, last_modified, indexed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        file.path,
        content,
        language,
        JSON.stringify(embedding),
        stats.mtimeMs,
        Date.now()
      )
    } catch (err) {
      console.error(`[CodebaseIndexService] Failed to index ${file.path}:`, err)
    }
  }

  private chunkContent(content: string, maxChunkSize: number = 2000): string[] {
    const chunks: string[] = []
    const lines = content.split('\n')
    let currentChunk = ''
    
    for (const line of lines) {
      if (currentChunk.length + line.length > maxChunkSize) {
        if (currentChunk) chunks.push(currentChunk.trim())
        currentChunk = line
      } else {
        currentChunk += '\n' + line
      }
    }
    
    if (currentChunk) chunks.push(currentChunk.trim())
    return chunks.length > 0 ? chunks : [content]
  }

  private averageEmbeddings(embeddings: number[][]): number[] {
    if (embeddings.length === 0) return []
    if (embeddings.length === 1) return embeddings[0]
    
    const dim = embeddings[0].length
    const avg = new Array(dim).fill(0)
    
    for (const emb of embeddings) {
      for (let i = 0; i < dim; i++) {
        avg[i] += emb[i]
      }
    }
    
    return avg.map(v => v / embeddings.length)
  }

  private computeTFIDF(content: string): number[] {
    const tokens = this.tokenize(content)
    
    const tf = new Map<string, number>()
    for (const token of tokens) {
      tf.set(token, (tf.get(token) ?? 0) + 1)
    }
    
    // Use cached IDF if available
    const idf = this.idfCache?.idf ?? new Map()
    
    const vector: number[] = []
    const sortedTokens = Array.from(tf.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100)
    
    for (const [term, count] of sortedTokens) {
      const idfVal = idf.get(term) ?? 1.0
      vector.push((count / tokens.length) * idfVal)
    }
    
    while (vector.length < 100) {
      vector.push(0)
    }
    
    return vector
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
  }

  private cleanupDeletedFiles(existingPaths: string[]): void {
    const existingSet = new Set(existingPaths)
    const allPaths = this.db.getDb()
      .prepare('SELECT path FROM codebase_index')
      .all() as Array<{ path: string }>
    
    for (const { path } of allPaths) {
      if (!existingSet.has(path)) {
        this.db.getDb()
          .prepare('DELETE FROM codebase_index WHERE path = ?')
          .run(path)
      }
    }
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  async search(query: string, limit: number = 10): Promise<SearchResult[]> {
    let queryVector: number[]
    let useSemantic = false
    
    // Try semantic embedding first
    if (this.embeddingService?.isAvailable()) {
      try {
        queryVector = await this.embeddingService.embed(query)
        useSemantic = true
      } catch {
        queryVector = this.computeTFIDF(query)
      }
    } else {
      queryVector = this.computeTFIDF(query)
    }
    
    const files = this.db.getDb()
      .prepare('SELECT * FROM codebase_index')
      .all() as Array<{
        id: string
        path: string
        content: string
        language: string
        embedding_json: string
        last_modified: number
        indexed_at: number
      }>
    
    const results: SearchResult[] = []
    
    for (const file of files) {
      try {
        const embedding = JSON.parse(file.embedding_json) as number[]
        const similarity = useSemantic && embedding.length > 100
          ? this.cosineSimilarityVectors(queryVector, embedding)
          : this.cosineSimilarity(queryVector, embedding)
        
        results.push({
          file: {
            id: file.id,
            path: file.path,
            content: file.content,
            language: file.language,
            embedding,
            lastModified: file.last_modified,
            indexedAt: file.indexed_at,
          },
          similarity,
        })
      } catch {
        continue
      }
    }
    
    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
  }

  searchByLanguage(language: string, query: string, limit: number = 10): Promise<SearchResult[]> {
    return this.search(query, limit * 2).then(results =>
      results.filter(r => r.file.language === language).slice(0, limit)
    )
  }

  private cosineSimilarity(a: number[], b: number[]): number {
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

  private cosineSimilarityVectors(a: number[], b: number[]): number {
    const len = Math.min(a.length, b.length)
    let dotProduct = 0
    let normA = 0
    let normB = 0
    
    for (let i = 0; i < len; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    
    if (normA === 0 || normB === 0) return 0
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }

  // -------------------------------------------------------------------------
  // Stats & Status
  // -------------------------------------------------------------------------

  getIndexStats(): { totalFiles: number; languages: Record<string, number>; lastIndexed: number | null } {
    const totalFiles = (this.db.getDb()
      .prepare('SELECT COUNT(*) as count FROM codebase_index')
      .get() as { count: number }).count
    
    const langResults = this.db.getDb()
      .prepare('SELECT language, COUNT(*) as count FROM codebase_index GROUP BY language')
      .all() as Array<{ language: string; count: number }>
    
    const languages: Record<string, number> = {}
    for (const { language, count } of langResults) {
      languages[language] = count
    }
    
    const lastIndexedResult = this.db.getDb()
      .prepare('SELECT MAX(indexed_at) as last_indexed FROM codebase_index')
      .get() as { last_indexed: number | null }
    
    return {
      totalFiles,
      languages,
      lastIndexed: lastIndexedResult?.last_indexed,
    }
  }

  getIsIndexing(): boolean {
    return this.isIndexing
  }

  getIndexProgress(): { total: number; current: number } {
    return this.indexProgress
  }

  // -------------------------------------------------------------------------
  // IPC Handlers
  // -------------------------------------------------------------------------

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'codebase:index': async () => {
        await this.indexWorkspace()
        return { success: true }
      },
      'codebase:search': async (_event: any, query: string, limit?: number) => 
        this.search(query, limit),
      'codebase:searchByLanguage': async (_event: any, language: string, query: string, limit?: number) =>
        this.searchByLanguage(language, query, limit),
      'codebase:stats': () => this.getIndexStats(),
      'codebase:isIndexing': () => this.getIsIndexing(),
      'codebase:progress': () => this.getIndexProgress(),
    }
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close()
    }
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout)
    }
  }
}
