import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { spawn, type ChildProcess } from 'child_process'
import { execSync } from 'child_process'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import { WindowManager } from '../windows/WindowManager.js'

type MCPServerId = string

interface MCPTool {
  name: string
  description: string
  parameters: {
    type: string
    properties: Record<string, unknown>
    required?: string[]
  }
}

interface MCPToolCall {
  id: string
  serverId: MCPServerId
  toolName: string
  arguments: Record<string, unknown>
}

interface MCPToolResult {
  id: string
  toolCallId: string
  serverId: MCPServerId
  success: boolean
  output?: unknown
  error?: string
  durationMs: number
}

interface MCPServerConfig {
  id: MCPServerId
  name: string
  transport: 'stdio' | 'sse' | 'http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  timeoutMs?: number
}

interface BuiltInTool {
  name: string
  description: string
  execute: (args: Record<string, unknown>) => unknown | Promise<unknown>
}

interface RunningServer {
  config: MCPServerConfig
  process: ChildProcess
  pingTimer: ReturnType<typeof setInterval>
  pendingPingId: number | null
  lastPongAt: number
  restartCount: number
  status: 'running' | 'down' | 'restarting'
}

const PING_INTERVAL_MS = 3000
const PONG_TIMEOUT_MS = 5000
const MAX_RESTARTS = 3
const RESTART_DELAY_MS = 1000

export class MCPService {
  private registry: Map<string, BuiltInTool> = new Map()
  private servers: Map<MCPServerId, MCPServerConfig> = new Map()
  private running: Map<MCPServerId, RunningServer> = new Map()
  private nextPingId = 1

  init(): void {
    this._registerBuiltins()
    ServiceRegistry.getInstance().register(SERVICE_TOKENS.MCPService, this)
  }

  private _push(channel: string, payload: unknown): void {
    const win = WindowManager.getInstance().get('main')
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }

  private _registerBuiltins(): void {
    const tools: BuiltInTool[] = [
      {
        name: 'read_file',
        description: 'Read the contents of a file at the given path',
        execute: (args) => {
          const filePath = args['path'] as string
          return fs.readFileSync(filePath, 'utf8')
        },
      },
      {
        name: 'write_file',
        description: 'Write content to a file, creating parent directories if needed',
        execute: (args) => {
          const filePath = args['path'] as string
          const content = args['content'] as string
          fs.mkdirSync(path.dirname(filePath), { recursive: true })
          fs.writeFileSync(filePath, content, 'utf8')
          return { success: true, path: filePath }
        },
      },
      {
        name: 'list_dir',
        description: 'List files and directories at the given path',
        execute: (args) => {
          const dirPath = args['path'] as string
          return fs.readdirSync(dirPath)
        },
      },
      {
        name: 'run_shell',
        description: 'Run a shell command and return stdout, stderr, and exit code',
        execute: (args) => {
          const command = args['command'] as string
          const cwd = args['cwd'] as string | undefined
          try {
            const stdout = execSync(command, {
              encoding: 'utf8',
              cwd,
              timeout: 30000,
            })
            return { stdout, stderr: '', exitCode: 0 }
          } catch (err: any) {
            return {
              stdout: err.stdout ?? '',
              stderr: err.stderr ?? err.message ?? String(err),
              exitCode: err.status ?? 1,
            }
          }
        },
      },
      {
        name: 'web_fetch',
        description: 'Fetch the text content of a URL',
        execute: async (args) => {
          const url = args['url'] as string
          const response = await fetch(url)
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
          return await response.text()
        },
      },
      {
        name: 'search_memory',
        description: 'Search the agent memory store for relevant entries',
        execute: (args) => {
          const query = args['query'] as string
          try {
            const memoryService = ServiceRegistry.getInstance().resolve<any>(SERVICE_TOKENS.MemoryService)
            const results = memoryService.search(query, 5)
            return JSON.stringify(results)
          } catch {
            return '[]'
          }
        },
      },
    ]

    for (const tool of tools) {
      this.registry.set(tool.name, tool)
    }
  }

  // -------------------------------------------------------------------------
  // Server lifecycle: spawn, ping, restart
  // -------------------------------------------------------------------------

  registerServer(config: MCPServerConfig): void {
    this.servers.set(config.id, config)
    if (config.transport === 'stdio' && config.command) {
      this._spawnServer(config)
    }
  }

  removeServer(id: MCPServerId): void {
    const running = this.running.get(id)
    if (running) {
      clearInterval(running.pingTimer)
      if (!running.process.killed) {
        running.process.kill()
      }
      this.running.delete(id)
    }
    this.servers.delete(id)
  }

  private _spawnServer(config: MCPServerConfig): void {
    if (!config.command) {
      console.warn(`[MCPService] Cannot spawn server ${config.id}: no command`)
      return
    }

    // Stop any existing process first
    const existing = this.running.get(config.id)
    if (existing) {
      clearInterval(existing.pingTimer)
      if (!existing.process.killed) {
        try { existing.process.kill() } catch {}
      }
      this.running.delete(config.id)
    }

    console.log(`[MCPService] Spawning server ${config.id}: ${config.command} ${(config.args ?? []).join(' ')}`)

    const proc = spawn(config.command, config.args ?? [], {
      env: { ...process.env, ...config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const running: RunningServer = {
      config,
      process: proc,
      pingTimer: null as any,
      pendingPingId: null,
      lastPongAt: Date.now(),
      restartCount: existing ? existing.restartCount + 1 : 0,
      status: 'running',
    }

    // Handle stdout (JSON-RPC responses)
    let buffer = ''
    proc.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)
          if (msg.id !== undefined && msg.id === running.pendingPingId) {
            running.pendingPingId = null
            running.lastPongAt = Date.now()
          }
        } catch {
          // ignore non-JSON lines
        }
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      console.error(`[MCPService] ${config.id} stderr:`, chunk.toString('utf8').trim())
    })

    proc.on('error', (err) => {
      console.error(`[MCPService] ${config.id} process error:`, err)
      this._handleServerFailure(config.id, `process error: ${err.message}`)
    })

    proc.on('exit', (code, signal) => {
      console.log(`[MCPService] ${config.id} process exited (code=${code}, signal=${signal})`)
      this._handleServerFailure(config.id, `exited with code ${code}`)
    })

    // Start ping loop
    running.pingTimer = setInterval(() => {
      this._sendPing(config.id)
    }, PING_INTERVAL_MS)

    this.running.set(config.id, running)
    running.status = 'running'

    this._push('mcp:serverStatus', { serverId: config.id, status: 'running' })
    this._push('mcp:serverUp', { serverId: config.id, pid: proc.pid ?? 0 })
  }

  private _sendPing(serverId: MCPServerId): void {
    const running = this.running.get(serverId)
    if (!running || running.status !== 'running') return

    // Check if previous ping timed out
    if (running.pendingPingId !== null) {
      const sinceLastPong = Date.now() - running.lastPongAt
      if (sinceLastPong > PONG_TIMEOUT_MS) {
        console.warn(`[MCPService] ${serverId} ping timeout (${sinceLastPong}ms since last pong)`)
        this._handleServerFailure(serverId, 'ping timeout')
        return
      }
    }

    const id = this.nextPingId++
    running.pendingPingId = id
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method: 'ping' }) + '\n'
    try {
      running.process.stdin?.write(msg)
    } catch (err) {
      console.error(`[MCPService] ${serverId} failed to write ping:`, err)
      this._handleServerFailure(serverId, 'stdin write failed')
    }
  }

  private _handleServerFailure(serverId: MCPServerId, reason: string): void {
    const running = this.running.get(serverId)
    if (!running) return

    if (running.status === 'restarting' || running.status === 'down') return

    clearInterval(running.pingTimer)
    running.status = 'down'

    // Kill the process if still alive
    if (!running.process.killed) {
      try { running.process.kill() } catch {}
    }

    this._push('mcp:serverStatus', { serverId, status: 'down' })
    this._push('mcp:serverDown', { serverId, reason })
    console.error(`[MCPService] Server ${serverId} is DOWN: ${reason}`)

    if (running.restartCount < MAX_RESTARTS) {
      console.log(`[MCPService] Restarting ${serverId} in ${RESTART_DELAY_MS}ms (attempt ${running.restartCount + 1}/${MAX_RESTARTS})`)
      running.status = 'restarting'
      setTimeout(() => {
        const config = this.servers.get(serverId)
        if (config) {
          this._spawnServer(config)
        }
      }, RESTART_DELAY_MS)
    } else {
      console.error(`[MCPService] ${serverId} exceeded max restarts (${MAX_RESTARTS}), giving up`)
      this.running.delete(serverId)
    }
  }

  // -------------------------------------------------------------------------
  // Tool execution
  // -------------------------------------------------------------------------

  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.registry.get(name)
    if (!tool) {
      throw new Error(`Tool not found: ${name}`)
    }

    let recorder: any = null
    try {
      recorder = ServiceRegistry.getInstance().resolve(SERVICE_TOKENS.EventRecorder)
    } catch {}

    recorder?.record({
      sessionId: 'unknown',
      type: 'tool:call',
      payload: { name, args }
    })

    const start = Date.now()
    try {
      const result = await Promise.resolve(tool.execute(args))
      const durationMs = Date.now() - start
      console.log(`[MCPService] Tool "${name}" completed in ${durationMs}ms`)

      recorder?.record({
        sessionId: 'unknown',
        type: 'tool:result',
        payload: { name, result: JSON.stringify(result).slice(0, 500) },
        durationMs
      })

      return result
    } catch (err) {
      console.error(`[MCPService] Tool "${name}" error:`, err)
      throw err
    }
  }

  listTools(): BuiltInTool[] {
    return Array.from(this.registry.values())
  }

  async callTool(serverId: MCPServerId, call: MCPToolCall): Promise<MCPToolResult> {
    return {
      id: crypto.randomUUID(),
      toolCallId: call.id,
      serverId,
      success: false,
      error: 'MCP tool execution not implemented',
      durationMs: 0,
    }
  }

  listServers(): MCPServerConfig[] {
    return [...this.servers.values()]
  }

  getServerStatus(serverId: MCPServerId): { status: string; pid?: number; restarts: number } | null {
    const running = this.running.get(serverId)
    if (!running) return null
    return {
      status: running.status,
      pid: running.process.pid ?? undefined,
      restarts: running.restartCount,
    }
  }

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'mcp:addServer': (_event: any, config: MCPServerConfig) => this.registerServer(config),
      'mcp:removeServer': (_event: any, serverId: MCPServerId) => { this.removeServer(serverId); return true },
      'mcp:listTools': (_event: any) =>
        this.listTools().map((t) => ({ name: t.name, description: t.description })),
      'mcp:callTool': (_event: any, call: MCPToolCall) => this.callTool(call.serverId, call),
      'mcp:register': (_event: any, config: MCPServerConfig) => this.registerServer(config),
      'mcp:listServers': () => this.listServers(),
      'mcp:call': (_event: any, call: MCPToolCall) => this.callTool(call.serverId, call),
      'mcp:executeTool': (
        _event: any,
        payload: { name: string; args: Record<string, unknown> }
      ) => this.executeTool(payload.name, payload.args),
      'mcp:getServerStatus': (_event: any, serverId: MCPServerId) => this.getServerStatus(serverId),
    }
  }
}
