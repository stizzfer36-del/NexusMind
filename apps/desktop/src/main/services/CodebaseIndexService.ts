import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import type { DatabaseService } from './DatabaseService.js'
import type { EmbeddingProvider } from './EmbeddingProvider.js'
import * as fs from 'node:fs'
import * as path from 'node:path'

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
  private embeddingProvider: EmbeddingProvider | null = null
  private workspaceRoot: string = ''
  private isIndexing: boolean = false
  private indexProgress: { total: number; current: number } = { total: 0, current: 0 }

  init(): void {
    const registry = ServiceRegistry.getInstance()
    this.db = registry.resolve<DatabaseService>(SERVICE_TOKENS.DB)
    this.ensureTable()
    
    try {
      this.embeddingProvider = registry.resolve<EmbeddingProvider>(SERVICE_TOKENS.EmbeddingProvider)
    } catch {
      console.log('[CodebaseIndexService] EmbeddingProvider not available, using TF-IDF fallback')
    }

    try {
      const settings = registry.resolve<any>(SERVICE_TOKENS.Settings)
      this.workspaceRoot = settings.get('workspaceRoot', process.cwd())
    } catch {
      this.workspaceRoot = process.cwd()
    }

    registry.register(SERVICE_TOKENS.CodebaseIndex, this)
  }

  private ensureTable(): void {
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
    `)
  }

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

      const batchSize = 10
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize)
        await Promise.all(batch.map(file => this.indexFile(file)))
        
        this.indexProgress.current = Math.min(i + batchSize, files.length)
        onProgress?.(this.indexProgress)
      }

      this.cleanupDeletedFiles(files.map(f => f.path))
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
      
      const existing = this.db.getDb()
        .prepare('SELECT last_modified FROM codebase_index WHERE path = ?')
        .get(file.path) as { last_modified: number } | undefined
      
      if (existing && existing.last_modified === stats.mtimeMs) {
        return
      }

      let embedding: number[] = []
      
      if (this.embeddingProvider) {
        try {
          const chunks = this.chunkContent(content)
          const embeddings = await Promise.all(
            chunks.map(chunk => this.embeddingProvider!.embed(chunk))
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
    const tokens = content.toLowerCase()
      .replace(/[^a-z0-9_]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
    
    const freq = new Map<string, number>()
    for (const token of tokens) {
      freq.set(token, (freq.get(token) || 0) + 1)
    }
    
    const vector: number[] = []
    const sortedTokens = Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100)
    
    for (const [_, count] of sortedTokens) {
      vector.push(count / tokens.length)
    }
    
    while (vector.length < 100) {
      vector.push(0)
    }
    
    return vector
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

  search(query: string, limit: number = 10): SearchResult[] {
    const queryEmbedding = this.computeTFIDF(query)
    
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
        const similarity = this.cosineSimilarity(queryEmbedding, embedding)
        
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

  searchByLanguage(language: string, query: string, limit: number = 10): SearchResult[] {
    return this.search(query, limit * 2)
      .filter(r => r.file.language === language)
      .slice(0, limit)
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

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'codebase:index': async () => {
        await this.indexWorkspace()
        return { success: true }
      },
      'codebase:search': (_event: any, query: string, limit?: number) => 
        this.search(query, limit),
      'codebase:searchByLanguage': (_event: any, language: string, query: string, limit?: number) =>
        this.searchByLanguage(language, query, limit),
      'codebase:stats': () => this.getIndexStats(),
      'codebase:isIndexing': () => this.getIsIndexing(),
      'codebase:progress': () => this.getIndexProgress(),
    }
  }
}
