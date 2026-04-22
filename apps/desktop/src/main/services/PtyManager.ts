import * as pty from 'node-pty'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import { WindowManager } from '../windows/WindowManager.js'
import crypto from 'crypto'

interface TerminalSession {
  id: string
  pid: number
  shell: string
  cwd: string
}

interface TerminalData {
  id: string
  data: string
}

interface TerminalResize {
  id: string
  cols: number
  rows: number
}

function defaultShell(): string {
  return process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash')
}

export class PtyManager {
  private sessions: Map<string, pty.IPty> = new Map()

  init(): void {
    ServiceRegistry.getInstance().register(SERVICE_TOKENS.PtyManager, this)
  }

  spawn(id: string, shell: string, cwd: string, cols: number, rows: number): TerminalSession {
    try {
      const proc = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols,
        rows,
        cwd,
        env: process.env as Record<string, string>,
      })

      this.sessions.set(id, proc)

      let chunkCounter = 0
      proc.onData((data: string) => {
        const payload = { id, data } satisfies TerminalData
        this.pushToWindows('terminal:data', payload)
        this.pushToWindows('pty:data', payload)
        try {
          const link = ServiceRegistry.getInstance().resolve(SERVICE_TOKENS.LinkService) as any
          link.broadcast({ type: 'pty:data', payload: { id, data } })
        } catch { /* link not ready */ }
        // Feed to ContextService for system context aggregation
        try {
          const ctx = ServiceRegistry.getInstance().resolve(SERVICE_TOKENS.ContextService) as any
          ctx.appendPtyOutput(id, data)
        } catch { /* ContextService not ready */ }
        // Sample 1-in-20 PTY chunks for replay recording
        chunkCounter++
        if (chunkCounter % 20 === 0) {
          try {
            const recorder = ServiceRegistry.getInstance().resolve(SERVICE_TOKENS.EventRecorder) as any
            recorder.record({
              sessionId: id,
              type: 'pty:chunk',
              payload: { data: data.slice(0, 200) }
            })
          } catch { /* recorder not ready yet */ }
        }
      })

      proc.onExit(({ exitCode }: { exitCode: number; signal?: number }) => {
        this.pushToWindows('terminal:exit', { id, exitCode })
        this.pushToWindows('pty:exit', { id, exitCode })
        this.sessions.delete(id)
      })

      return { id, pid: proc.pid, shell, cwd }
    } catch (err) {
      console.error(`[PtyManager] spawn failed for id=${id}:`, err)
      throw err
    }
  }

  write(id: string, data: string): void {
    try {
      const session = this.sessions.get(id)
      if (!session) {
        console.error(`[PtyManager] write: no session found for id=${id}`)
        return
      }
      session.write(data)
    } catch (err) {
      console.error(`[PtyManager] write failed for id=${id}:`, err)
    }
  }

  resize(id: string, cols: number, rows: number): void {
    try {
      const session = this.sessions.get(id)
      if (!session) {
        console.error(`[PtyManager] resize: no session found for id=${id}`)
        return
      }
      session.resize(cols, rows)
    } catch (err) {
      console.error(`[PtyManager] resize failed for id=${id}:`, err)
    }
  }

  kill(id: string): void {
    try {
      const session = this.sessions.get(id)
      if (!session) {
        console.error(`[PtyManager] kill: no session found for id=${id}`)
        return
      }
      session.kill()
      this.sessions.delete(id)
    } catch (err) {
      console.error(`[PtyManager] kill failed for id=${id}:`, err)
    }
  }

  listSessions(): string[] {
    return [...this.sessions.keys()]
  }

  private pushToWindows(channel: string, payload: unknown): void {
    const win = WindowManager.getInstance().get('main')
    if (win) {
      win.webContents.send(channel, payload)
    }
  }

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'terminal:spawn': (event: any, shell?: string) =>
        this.spawn(crypto.randomUUID(), shell || defaultShell(), process.cwd(), 80, 24),

      'terminal:write': (event: any, payload: TerminalData) =>
        this.write(payload.id, payload.data),

      'terminal:resize': (event: any, payload: TerminalResize) =>
        this.resize(payload.id, payload.cols, payload.rows),

      'terminal:kill': (event: any, id: string) =>
        this.kill(id),

      'pty:spawn': (event: any, id: string, shell: string, cwd: string, cols: number, rows: number) =>
        this.spawn(id, shell, cwd, cols, rows),

      'pty:write': (event: any, id: string, data: string) =>
        this.write(id, data),

      'pty:resize': (event: any, id: string, cols: number, rows: number) =>
        this.resize(id, cols, rows),

      'pty:kill': (event: any, id: string) =>
        this.kill(id),

      'pty:list': () =>
        this.listSessions(),

      'pty:create': (event: any, shell?: string) =>
        this.spawn(crypto.randomUUID(), shell || defaultShell(), process.cwd(), 80, 24),

      'pty:close': (event: any, id: string) =>
        this.kill(id),
    }
  }
}
