import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { WebSocketServer, WebSocket } from 'ws'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import { WindowManager } from '../windows/WindowManager.js'
import type { LinkConfig, LinkEvent } from '@nexusmind/shared'

const SETTINGS_KEY = 'nexuslink'
const DEFAULT_CONFIG: LinkConfig = { enabled: false, port: 7771 }
const MAX_CLIENTS = 3

export class LinkService {
  private config: LinkConfig = { ...DEFAULT_CONFIG }
  private httpServer: http.Server | null = null
  private wss: WebSocketServer | null = null
  private clients: Set<WebSocket> = new Set()
  private pingTimer: ReturnType<typeof setInterval> | null = null

  async init(): Promise<void> {
    ServiceRegistry.getInstance().register(SERVICE_TOKENS.LinkService, this)
    try {
      const settings = ServiceRegistry.getInstance().resolve(SERVICE_TOKENS.Settings) as any
      const saved = settings.get(SETTINGS_KEY, DEFAULT_CONFIG)
      this.config = { ...DEFAULT_CONFIG, ...saved }
    } catch {
      this.config = { ...DEFAULT_CONFIG }
    }
    if (this.config.enabled) {
      this.startServer()
    }
  }

  getConfig(): LinkConfig {
    return { ...this.config, running: this.isRunning, clientCount: this.clients.size }
  }

  setConfig(incomingConfig: LinkConfig): void {
    const wasEnabled = this.config.enabled
    const oldPort = this.config.port
    this.config = { ...incomingConfig }
    try {
      const settings = ServiceRegistry.getInstance().resolve(SERVICE_TOKENS.Settings) as any
      settings.set(SETTINGS_KEY, incomingConfig)
    } catch {}
    if (incomingConfig.enabled && !wasEnabled) {
      this.startServer()
    } else if (!incomingConfig.enabled && wasEnabled) {
      this.stopServer()
    } else if (incomingConfig.enabled && wasEnabled && incomingConfig.port !== oldPort) {
      this.stopServer()
      this.startServer()
    }
    this.pushStatus()
  }

  broadcast(event: LinkEvent): void {
    if (!this.wss) return
    const msg = JSON.stringify(event)
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg)
      }
    }
  }

  private get isRunning(): boolean {
    return this.httpServer !== null && this.httpServer.listening
  }

  private getClientHtml(): string {
    const candidates = [
      path.join(app.getAppPath(), 'public/link-client/index.html'),
      path.join(app.getAppPath(), '../../apps/desktop/public/link-client/index.html'),
      path.join(__dirname, '../../../public/link-client/index.html'),
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8')
    }
    return '<html><body><h2>NexusLink</h2><p>Client file not found. Open this page from apps/desktop/public/link-client/index.html</p></body></html>'
  }

  private startServer(): void {
    try {
      this.httpServer = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(this.getClientHtml())
      })

      this.httpServer.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`[LinkService] Port ${this.config.port} already in use`)
        } else {
          console.error('[LinkService] HTTP server error:', err)
        }
        this.httpServer = null
        this.wss = null
        this.pushStatus()
      })

      this.wss = new WebSocketServer({ server: this.httpServer })

      this.wss.on('connection', (ws) => {
        if (this.clients.size >= MAX_CLIENTS) {
          ws.close(1013, 'Too many clients')
          return
        }
        if (this.config.token) {
          let authed = false
          const authTimeout = setTimeout(() => { if (!authed) ws.terminate() }, 5000)
          ws.once('message', (raw) => {
            clearTimeout(authTimeout)
            try {
              const msg = JSON.parse(raw.toString())
              if (msg.type === 'auth' && msg.payload?.token === this.config.token) {
                authed = true
                this.clients.add(ws)
                ws.send(JSON.stringify({ type: 'auth', payload: { ok: true } }))
                this.attachClientHandlers(ws)
                this.sendSessionSummary(ws)
              } else {
                ws.close(4001, 'Unauthorized')
              }
            } catch {
              ws.terminate()
            }
          })
        } else {
          this.clients.add(ws)
          this.attachClientHandlers(ws)
          this.sendSessionSummary(ws)
        }
      })

      this.pingTimer = setInterval(() => {
        this.broadcast({ type: 'ping', payload: null })
      }, 30_000)

      this.httpServer.listen(this.config.port, () => {
        console.log(`[LinkService] Listening on http://localhost:${this.config.port}`)
        this.pushStatus()
      })
    } catch (err) {
      console.error('[LinkService] Failed to start server:', err)
      this.httpServer = null
      this.wss = null
      this.pushStatus()
    }
  }

  private attachClientHandlers(ws: WebSocket): void {
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'pong') return
        if (msg.type === 'pty:resize') {
          try {
            const ptyManager = ServiceRegistry.getInstance().resolve(SERVICE_TOKENS.PtyManager) as any
            ptyManager.resize(msg.payload.id, msg.payload.cols, msg.payload.rows)
          } catch {}
        }
      } catch {}
    })
    ws.on('close', () => { this.clients.delete(ws) })
    ws.on('error', () => { this.clients.delete(ws) })
  }

  private sendSessionSummary(ws: WebSocket): void {
    try {
      const ptyManager = ServiceRegistry.getInstance().resolve(SERVICE_TOKENS.PtyManager) as any
      const ptyIds: string[] = ptyManager.listSessions()
      ws.send(JSON.stringify({
        type: 'session:summary',
        payload: {
          ptyTabs: ptyIds.map((id: string) => ({ id, title: `Terminal ${id.slice(0, 6)}` })),
        },
      }))
    } catch {}
  }

  private stopServer(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
    for (const client of this.clients) {
      client.terminate()
    }
    this.clients.clear()
    if (this.wss) {
      this.wss.close()
      this.wss = null
    }
    if (this.httpServer) {
      this.httpServer.close()
      this.httpServer = null
    }
    console.log('[LinkService] Stopped')
    this.pushStatus()
  }

  private pushStatus(): void {
    const win = WindowManager.getInstance().get('main')
    win?.webContents.send('link:statusChange', {
      running: this.isRunning,
      clientCount: this.clients.size,
    })
  }

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'link:getConfig': (_event: any) => this.getConfig(),
      'link:setConfig': (_event: any, config: LinkConfig) => this.setConfig(config),
    }
  }

  shutdown(): void {
    this.stopServer()
  }
}
