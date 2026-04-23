import fs from 'node:fs'
import path from 'node:path'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import { WindowManager } from '../windows/WindowManager.js'
import { applyDiff, type DiffResult } from '@nexusmind/shared'

// ---------------------------------------------------------------------------
// FileService
// ---------------------------------------------------------------------------

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  mtime: number
}

export class FileService {
  private workspaceRoot: string
  private watchers = new Map<string, fs.FSWatcher>()
  private watchIdCounter = 0

  constructor(workspaceRoot?: string) {
    this.workspaceRoot = workspaceRoot ?? process.cwd()
  }

  init(): void {
    try {
      const settings = ServiceRegistry.getInstance().resolve<any>(SERVICE_TOKENS.Settings)
      const saved = settings.get<string | undefined>('workspaceRoot', undefined)
      if (saved) {
        this.workspaceRoot = saved
      }
    } catch {
      // Settings not available — keep default
    }
    ServiceRegistry.getInstance().register(SERVICE_TOKENS.FileService, this)
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private resolve(filePath: string): string {
    const absolute = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.workspaceRoot, filePath)

    // Security: prevent escaping workspaceRoot via ../ traversal
    const resolved = path.resolve(absolute)
    const rootResolved = path.resolve(this.workspaceRoot)
    if (!resolved.startsWith(rootResolved)) {
      throw new Error('Path is outside the workspace')
    }
    return resolved
  }

  private push(channel: string, payload: unknown): void {
    WindowManager.getInstance().get('main')?.webContents.send(channel, payload)
  }

  // -------------------------------------------------------------------------
  // file:read
  // -------------------------------------------------------------------------

  read(filePath: string): string {
    const target = this.resolve(filePath)
    return fs.readFileSync(target, 'utf-8')
  }

  // -------------------------------------------------------------------------
  // file:write
  // -------------------------------------------------------------------------

  write(filePath: string, content: string): void {
    const target = this.resolve(filePath)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content, 'utf-8')
  }

  // -------------------------------------------------------------------------
  // file:listDir
  // -------------------------------------------------------------------------

  listDir(dirPath: string): FileEntry[] {
    const target = this.resolve(dirPath)
    const entries = fs.readdirSync(target, { withFileTypes: true })
    return entries.map((entry) => {
      const fullPath = path.join(target, entry.name)
      const stat = fs.statSync(fullPath)
      return {
        name: entry.name,
        path: path.relative(this.workspaceRoot, fullPath),
        isDirectory: entry.isDirectory(),
        size: stat.size,
        mtime: stat.mtimeMs,
      }
    })
  }

  list(dirPath: string, options?: { recursive?: boolean; includeDirs?: boolean }): { success: boolean; files?: string[]; error?: string } {
    try {
      const target = this.resolve(dirPath)
      const files: string[] = []
      
      const walk = (currentPath: string) => {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name)
          if (entry.isDirectory()) {
            if (options?.includeDirs) {
              files.push(fullPath)
            }
            if (options?.recursive !== false) {
              walk(fullPath)
            }
          } else {
            files.push(fullPath)
          }
        }
      }
      
      walk(target)
      return { success: true, files }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  // -------------------------------------------------------------------------
  // file:applyDiff
  // -------------------------------------------------------------------------

  applyDiff(filePath: string, diff: DiffResult): string {
    const target = this.resolve(filePath)
    const original = fs.readFileSync(target, 'utf-8')
    const updated = applyDiff(original, diff)
    fs.writeFileSync(target, updated, 'utf-8')
    return updated
  }

  // -------------------------------------------------------------------------
  // file:watch
  // -------------------------------------------------------------------------

  watch(filePath: string): string {
    const target = this.resolve(filePath)
    const id = `watch-${++this.watchIdCounter}`

    const watcher = fs.watch(target, { recursive: true }, (eventType, filename) => {
      this.push('file:watchEvent', {
        id,
        eventType,
        path: filename ? path.relative(this.workspaceRoot, path.join(target, filename)) : undefined,
      })
    })

    this.watchers.set(id, watcher)
    return id
  }

  unwatch(id: string): void {
    const watcher = this.watchers.get(id)
    if (watcher) {
      watcher.close()
      this.watchers.delete(id)
    }
  }

  dispose(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close()
    }
    this.watchers.clear()
  }

  // -------------------------------------------------------------------------
  // IPC handlers
  // -------------------------------------------------------------------------

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'file:read': (_event: any, filePath: string) => this.read(filePath),
      'file:write': (_event: any, filePath: string, content: string) => this.write(filePath, content),
      'file:listDir': (_event: any, dirPath: string) => this.listDir(dirPath),
      'file:list': (_event: any, dirPath: string, options?: { recursive?: boolean; includeDirs?: boolean }) => this.list(dirPath, options),
      'file:applyDiff': (_event: any, filePath: string, diff: DiffResult) => this.applyDiff(filePath, diff),
      'file:watch': (_event: any, filePath: string) => this.watch(filePath),
      'file:unwatch': (_event: any, id: string) => this.unwatch(id),
    }
  }
}
