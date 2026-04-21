import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'

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

export class MCPService {
  private registry: Map<string, BuiltInTool> = new Map()
  private servers: Map<MCPServerId, MCPServerConfig> = new Map()

  init(): void {
    this._registerBuiltins()
    ServiceRegistry.getInstance().register(SERVICE_TOKENS.MCPService, this)
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

  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.registry.get(name)
    if (!tool) {
      throw new Error(`Tool not found: ${name}`)
    }
    const start = Date.now()
    try {
      const result = await Promise.resolve(tool.execute(args))
      console.log(`[MCPService] Tool "${name}" completed in ${Date.now() - start}ms`)
      return result
    } catch (err) {
      console.error(`[MCPService] Tool "${name}" error:`, err)
      throw err
    }
  }

  listTools(): BuiltInTool[] {
    return Array.from(this.registry.values())
  }

  registerServer(config: MCPServerConfig): void {
    this.servers.set(config.id, config)
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

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'mcp:addServer': (_event: any, config: MCPServerConfig) => this.registerServer(config),
      'mcp:removeServer': (_event: any, serverId: MCPServerId) => this.servers.delete(serverId),
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
    }
  }
}
