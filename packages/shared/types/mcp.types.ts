export type MCPServerId = string

export interface MCPTool {
  name: string
  description: string
  parameters: {
    type: string
    properties: Record<string, unknown>
    required?: string[]
  }
}

export interface MCPToolCall {
  id: string
  serverId: MCPServerId
  toolName: string
  arguments: Record<string, unknown>
}

export interface MCPToolResult {
  id: string
  toolCallId: string
  serverId: MCPServerId
  success: boolean
  output?: string
  error?: string
  durationMs: number
}

export interface MCPServerConfig {
  id: MCPServerId
  name: string
  transport: 'stdio' | 'sse' | 'http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  timeoutMs: number
}

export interface MCPToolInfo {
  name: string
  description: string
  inputSchema?: Record<string, unknown>
}

export type MCPToolExecutePayload = {
  name: string
  args: Record<string, unknown>
}
