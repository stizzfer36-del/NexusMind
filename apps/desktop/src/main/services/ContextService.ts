import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'

// ---------------------------------------------------------------------------
// ContextService
// ---------------------------------------------------------------------------
// Aggregates real-time project context so every model call includes awareness
// of the user's current environment:
//   • Active file (last opened / edited file in the renderer)
//   • Recent terminal / PTY output
//   • Git diff (staged + unstaged changes)
//
// Injected into ModelRouter.route() as a leading SYSTEM message.
// ---------------------------------------------------------------------------

const MAX_PTY_LINES = 100
const MAX_PTY_CHARS = 8_000

export class ContextService {
  private activeFile: { path: string; content: string } | null = null
  private ptyBuffers = new Map<string, string>()
  private gitAvailable = false

  init(): void {
    ServiceRegistry.getInstance().register(SERVICE_TOKENS.ContextService, this)
    this._checkGit()
  }

  // -------------------------------------------------------------------------
  // Active file
  // -------------------------------------------------------------------------

  setActiveFile(filePath: string, content: string): void {
    this.activeFile = { path: filePath, content }
  }

  getActiveFile(): { path: string; content: string } | null {
    return this.activeFile
  }

  // -------------------------------------------------------------------------
  // PTY output
  // -------------------------------------------------------------------------

  appendPtyOutput(sessionId: string, data: string): void {
    let buffer = this.ptyBuffers.get(sessionId) ?? ''
    buffer += data
    // Keep only the tail of the buffer
    if (buffer.length > MAX_PTY_CHARS) {
      buffer = buffer.slice(-MAX_PTY_CHARS)
    }
    this.ptyBuffers.set(sessionId, buffer)
  }

  getRecentPtyOutput(sessionId?: string, maxLines = 50): string {
    if (sessionId) {
      const buf = this.ptyBuffers.get(sessionId)
      if (!buf) return ''
      return this._tailLines(buf, maxLines)
    }
    // Aggregate across all sessions
    const all = Array.from(this.ptyBuffers.values()).join('\n')
    return this._tailLines(all, maxLines)
  }

  private _tailLines(text: string, n: number): string {
    const lines = text.split('\n')
    if (lines.length <= n) return text
    return lines.slice(-n).join('\n')
  }

  // -------------------------------------------------------------------------
  // Git diff (stubbed)
  // -------------------------------------------------------------------------

  private _checkGit(): void {
    // Future: spawn `git --version` and set this.gitAvailable = true
    this.gitAvailable = false
  }

  getGitDiff(): string {
    if (!this.gitAvailable) {
      return ''
    }
    // TODO: spawn `git diff --stat` and `git diff` to get real diff
    return ''
  }

  // -------------------------------------------------------------------------
  // System context assembly
  // -------------------------------------------------------------------------

  buildSystemContext(): string {
    const parts: string[] = []

    // Active file
    if (this.activeFile) {
      const { path: p, content } = this.activeFile
      const preview = content.length > 2_000
        ? content.slice(0, 2_000) + '\n... [truncated]'
        : content
      parts.push(`<active_file path="${p}">\n${preview}\n</active_file>`)
    }

    // Recent terminal output
    const ptyOutput = this.getRecentPtyOutput(undefined, MAX_PTY_LINES)
    if (ptyOutput) {
      parts.push(`<terminal_output>\n${ptyOutput}\n</terminal_output>`)
    }

    // Git diff
    const diff = this.getGitDiff()
    if (diff) {
      parts.push(`<git_diff>\n${diff}\n</git_diff>`)
    }

    if (parts.length === 0) {
      return ''
    }

    return [
      'You are NexusMind, an AI coding assistant.',
      'Below is the current project context. Reference it when answering.',
      '',
      ...parts,
    ].join('\n')
  }

  // -------------------------------------------------------------------------
  // IPC handlers
  // -------------------------------------------------------------------------

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'context:setActiveFile': (_event: any, filePath: string, content: string) => {
        this.setActiveFile(filePath, content)
        return { ok: true }
      },
      'context:getActiveFile': () => this.getActiveFile(),
      'context:getSystemContext': () => this.buildSystemContext(),
    }
  }
}
