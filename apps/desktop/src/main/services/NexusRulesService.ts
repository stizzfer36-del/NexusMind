import * as fs from 'node:fs'
import * as path from 'node:path'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import type { FileService } from './FileService.js'

// ---------------------------------------------------------------------------
// NexusRulesService
// ---------------------------------------------------------------------------
// Loads and manages .nexusrules files from the workspace.
// 
// .nexusrules files are markdown documents that define project conventions,
// coding standards, and constraints that should be applied to every session.
// They are automatically discovered and loaded when the workspace changes.
//
// File locations (in order of precedence):
//   1. .nexusrules (workspace root)
//   2. .nexus/nexus.rules.md (workspace root)
//   3. Parent directories (walk up to find nearest .nexusrules)
//
// Format:
//   - Markdown with sections for different rule categories
//   - Special sections: # Stack, # Conventions, # Patterns, # Restrictions
//   - Frontmatter supported for metadata
//
// Hot-reloading:
//   - Files are watched for changes
//   - Changes trigger automatic reload
// ---------------------------------------------------------------------------

interface NexusRulesContent {
  content: string
  filePath: string
  lastModified: number
  sections: Map<string, string>
  metadata: Record<string, string>
}

interface CursorRuleFile {
  content: string
  filePath: string
  type: 'cursorrules' | 'cursor-rules'
}

export class NexusRulesService {
  private fileService!: FileService
  private rules: NexusRulesContent | null = null
  private cursorRules: CursorRuleFile[] = []
  private workspaceRoot: string = ''
  private watchers: Array<{ close(): void }> = []
  private initialized = false

  init(): void {
    const registry = ServiceRegistry.getInstance()
    this.fileService = registry.resolve<FileService>(SERVICE_TOKENS.FileService)
    
    // Get workspace root from settings or file service
    try {
      const settings = registry.resolve<any>(SERVICE_TOKENS.Settings)
      this.workspaceRoot = settings.get('workspaceRoot', process.cwd())
    } catch {
      this.workspaceRoot = process.cwd()
    }

    registry.register(SERVICE_TOKENS.NexusRules, this)
    
    // Initial load
    this.loadAllRules()
    
    // Setup file watchers
    this.setupWatchers()
    
    this.initialized = true
    console.log('[NexusRulesService] Initialized, loaded rules from:', this.rules?.filePath || 'none')
  }

  // -------------------------------------------------------------------------
  // Rule loading
  // -------------------------------------------------------------------------

  loadAllRules(): void {
    this.loadNexusRules()
    this.loadCursorRules()
  }

  private loadNexusRules(): void {
    // Search for .nexusrules file
    const searchPaths = [
      path.join(this.workspaceRoot, '.nexusrules'),
      path.join(this.workspaceRoot, '.nexus', 'nexus.rules.md'),
    ]

    // Also walk up parent directories
    let currentDir = this.workspaceRoot
    while (currentDir !== path.dirname(currentDir)) {
      searchPaths.push(path.join(currentDir, '.nexusrules'))
      currentDir = path.dirname(currentDir)
    }

    for (const filePath of searchPaths) {
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8')
          const stats = fs.statSync(filePath)
          
          this.rules = {
            content,
            filePath,
            lastModified: stats.mtimeMs,
            sections: this.parseSections(content),
            metadata: this.parseFrontmatter(content),
          }
          
          console.log(`[NexusRulesService] Loaded .nexusrules from ${filePath}`)
          return
        } catch (err) {
          console.warn(`[NexusRulesService] Failed to load ${filePath}:`, err)
        }
      }
    }

    console.log('[NexusRulesService] No .nexusrules file found')
  }

  private loadCursorRules(): void {
    this.cursorRules = []
    
    // Load .cursorrules (single file in root)
    const cursorrulesPath = path.join(this.workspaceRoot, '.cursorrules')
    if (fs.existsSync(cursorrulesPath)) {
      try {
        const content = fs.readFileSync(cursorrulesPath, 'utf-8')
        this.cursorRules.push({
          content,
          filePath: cursorrulesPath,
          type: 'cursorrules',
        })
        console.log(`[NexusRulesService] Loaded .cursorrules from ${cursorrulesPath}`)
      } catch (err) {
        console.warn(`[NexusRulesService] Failed to load .cursorrules:`, err)
      }
    }

    // Load .cursor/rules/*.md (directory of rule files)
    const cursorRulesDir = path.join(this.workspaceRoot, '.cursor', 'rules')
    if (fs.existsSync(cursorRulesDir)) {
      try {
        const files = fs.readdirSync(cursorRulesDir)
          .filter(f => f.endsWith('.md'))
          .map(f => path.join(cursorRulesDir, f))

        for (const filePath of files) {
          const content = fs.readFileSync(filePath, 'utf-8')
          this.cursorRules.push({
            content,
            filePath,
            type: 'cursor-rules',
          })
        }
        
        if (files.length > 0) {
          console.log(`[NexusRulesService] Loaded ${files.length} .cursor/rules/*.md files`)
        }
      } catch (err) {
        console.warn(`[NexusRulesService] Failed to load .cursor/rules:`, err)
      }
    }
  }

  // -------------------------------------------------------------------------
  // Parsing
  // -------------------------------------------------------------------------

  private parseSections(content: string): Map<string, string> {
    const sections = new Map<string, string>()
    const lines = content.split('\n')
    let currentSection = ''
    let currentContent: string[] = []

    for (const line of lines) {
      const sectionMatch = line.match(/^#+\s+(.+)$/)
      if (sectionMatch) {
        if (currentSection) {
          sections.set(currentSection.toLowerCase(), currentContent.join('\n').trim())
        }
        currentSection = sectionMatch[1]
        currentContent = []
      } else {
        currentContent.push(line)
      }
    }

    if (currentSection) {
      sections.set(currentSection.toLowerCase(), currentContent.join('\n').trim())
    }

    return sections
  }

  private parseFrontmatter(content: string): Record<string, string> {
    const metadata: Record<string, string> = {}
    
    if (content.startsWith('---')) {
      const endIndex = content.indexOf('---', 3)
      if (endIndex !== -1) {
        const frontmatter = content.slice(3, endIndex).trim()
        const lines = frontmatter.split('\n')
        
        for (const line of lines) {
          const match = line.match(/^([\w-]+):\s*(.+)$/)
          if (match) {
            metadata[match[1]] = match[2].trim()
          }
        }
      }
    }

    return metadata
  }

  // -------------------------------------------------------------------------
  // File watching
  // -------------------------------------------------------------------------

  private setupWatchers(): void {
    // Clean up existing watchers
    this.watchers.forEach(w => w.close())
    this.watchers = []

    if (!this.workspaceRoot) return

    try {
      // Watch for .nexusrules changes
      const nexusrulesPath = path.join(this.workspaceRoot, '.nexusrules')
      if (fs.existsSync(nexusrulesPath)) {
        const watcher = fs.watch(nexusrulesPath, (eventType) => {
          if (eventType === 'change') {
            console.log('[NexusRulesService] .nexusrules changed, reloading...')
            this.loadNexusRules()
          }
        })
        this.watchers.push(watcher)
      }

      // Watch for .cursorrules changes
      const cursorrulesPath = path.join(this.workspaceRoot, '.cursorrules')
      if (fs.existsSync(cursorrulesPath)) {
        const watcher = fs.watch(cursorrulesPath, (eventType) => {
          if (eventType === 'change') {
            console.log('[NexusRulesService] .cursorrules changed, reloading...')
            this.loadCursorRules()
          }
        })
        this.watchers.push(watcher)
      }

      // Watch for .cursor/rules/ directory changes
      const cursorRulesDir = path.join(this.workspaceRoot, '.cursor', 'rules')
      if (fs.existsSync(cursorRulesDir)) {
        const watcher = fs.watch(cursorRulesDir, (eventType, filename) => {
          if (filename?.endsWith('.md')) {
            console.log(`[NexusRulesService] .cursor/rules/${filename} changed, reloading...`)
            this.loadCursorRules()
          }
        })
        this.watchers.push(watcher)
      }
    } catch (err) {
      console.warn('[NexusRulesService] Failed to setup file watchers:', err)
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  getRules(): NexusRulesContent | null {
    return this.rules
  }

  getCursorRules(): CursorRuleFile[] {
    return this.cursorRules
  }

  getAllRulesContent(): string {
    const parts: string[] = []

    // NexusMind rules
    if (this.rules) {
      parts.push('# Project Rules (.nexusrules)')
      parts.push(this.rules.content)
      parts.push('')
    }

    // Cursor compatibility
    if (this.cursorRules.length > 0) {
      for (const rule of this.cursorRules) {
        parts.push(`# Project Rules (${path.basename(rule.filePath)})`)
        parts.push(rule.content)
        parts.push('')
      }
    }

    return parts.join('\n')
  }

  getSection(sectionName: string): string | null {
    if (!this.rules) return null
    return this.rules.sections.get(sectionName.toLowerCase()) || null
  }

  getMetadata(key: string): string | null {
    if (!this.rules) return null
    return this.rules.metadata[key] || null
  }

  /**
   * Build system prompt context from rules.
   * This is injected into every LLM call.
   */
  buildRulesContext(): string {
    const content = this.getAllRulesContent()
    if (!content.trim()) {
      return ''
    }

    return [
      '<project_rules>',
      'The following are the project conventions and constraints. Follow them when making changes:',
      '',
      content,
      '</project_rules>',
    ].join('\n')
  }

  /**
   * Set a new workspace root and reload rules
   */
  setWorkspaceRoot(root: string): void {
    this.workspaceRoot = root
    this.loadAllRules()
    this.setupWatchers()
  }

  // -------------------------------------------------------------------------
  // IPC handlers
  // -------------------------------------------------------------------------

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'rules:reload': () => {
        this.loadAllRules()
        return { success: true, loaded: !!this.rules || this.cursorRules.length > 0 }
      },
      'rules:getContent': () => this.getAllRulesContent(),
      'rules:getSection': (_event: any, section: string) => this.getSection(section),
      'rules:getMetadata': (_event: any, key: string) => this.getMetadata(key),
      'rules:hasRules': () => !!this.rules || this.cursorRules.length > 0,
      'rules:setWorkspace': (_event: any, root: string) => {
        this.setWorkspaceRoot(root)
        return { success: true }
      },
    }
  }

  /**
   * Cleanup watchers on shutdown
   */
  dispose(): void {
    this.watchers.forEach(w => w.close())
    this.watchers = []
  }
}
