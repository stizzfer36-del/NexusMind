import crypto from 'crypto'
import { ServiceRegistry, SERVICE_TOKENS } from '../../ServiceRegistry.js'
import { ModelProvider, ModelCapability } from '@nexusmind/shared'
import type { WorkflowDAG, WorkflowNode } from '@nexusmind/shared'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_PROMPTS: Record<string, string> = {
  coordinator: 'You are the coordinator agent. Analyze the task and produce a clear, actionable implementation plan.',
  builder:     'You are the builder agent. Write clean, working code to implement the described task.',
  reviewer:    'You are the reviewer agent. Review the task output for correctness, bugs, and suggest improvements.',
  tester:      'You are the tester agent. Write tests or describe how to test the described feature.',
  docwriter:   'You are the docwriter agent. Write clear documentation or a summary for the described task.',
}

const DEFAULT_MODEL_CONFIG = {
  id: 'claude-sonnet-4-6',
  provider: ModelProvider.ANTHROPIC,
  name: 'Claude Sonnet 4.6',
  capabilities: [ModelCapability.CHAT, ModelCapability.STREAMING],
  contextWindow: 200_000,
  maxTokens: 4_096,
}

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface GraphExecutionContext {
  dagId: string
  input?: string
  outputs: Record<string, unknown>
  currentNodeId?: string
}

// ---------------------------------------------------------------------------
// GraphExecutor
// ---------------------------------------------------------------------------

export class GraphExecutor {

  // -------------------------------------------------------------------------
  // execute — public entry point
  // -------------------------------------------------------------------------

  async execute(dag: WorkflowDAG, input?: string): Promise<{ runId: string }> {
    const runId = crypto.randomUUID()

    const context: GraphExecutionContext = {
      dagId: dag.id,
      input,
      outputs: {},
    }

    const sorted = this.topologicalSort(dag)

    for (const node of sorted) {
      context.currentNodeId = node.id
      try {
        const result = await this.executeNode(node, context)
        context.outputs[node.id] = result
      } catch (err) {
        console.error(`[GraphExecutor] Error executing node "${node.id}" (${node.type}):`, err)
        // Only halt for agent/tool nodes; structural/condition nodes continue
        if (node.type === 'agent' || node.type === 'tool') {
          break
        }
      }
    }

    return { runId }
  }

  // -------------------------------------------------------------------------
  // topologicalSort — Kahn's algorithm with cycle detection
  // -------------------------------------------------------------------------

  private topologicalSort(dag: WorkflowDAG): WorkflowNode[] {
    const nodeMap = new Map<string, WorkflowNode>(dag.nodes.map((n) => [n.id, n]))

    // Build adjacency list and in-degree map
    const inDegree = new Map<string, number>()
    const adjacency = new Map<string, string[]>()

    for (const node of dag.nodes) {
      inDegree.set(node.id, 0)
      adjacency.set(node.id, [])
    }

    for (const edge of dag.edges) {
      adjacency.get(edge.source)?.push(edge.target)
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
    }

    // Seed queue with all zero-in-degree nodes
    const queue: string[] = []
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id)
    }

    const sorted: WorkflowNode[] = []

    while (queue.length > 0) {
      const id = queue.shift()!
      const node = nodeMap.get(id)
      if (node) sorted.push(node)

      for (const neighbor of adjacency.get(id) ?? []) {
        const newDegree = (inDegree.get(neighbor) ?? 1) - 1
        inDegree.set(neighbor, newDegree)
        if (newDegree === 0) queue.push(neighbor)
      }
    }

    if (sorted.length !== dag.nodes.length) {
      throw new Error('Workflow graph contains a cycle')
    }

    return sorted
  }

  // -------------------------------------------------------------------------
  // executeNode — dispatch by node type
  // -------------------------------------------------------------------------

  private async executeNode(
    node: WorkflowNode,
    context: GraphExecutionContext,
  ): Promise<unknown> {
    switch (node.type) {
      case 'start':
      case 'end':
        return null

      case 'agent':
        return this.executeAgentNode(node, context)

      case 'tool':
        return this.executeToolNode(node)

      case 'condition':
        return this.executeConditionNode(node, context)

      default:
        console.error(`[GraphExecutor] Unknown node type: ${(node as WorkflowNode).type}`)
        return null
    }
  }

  // -------------------------------------------------------------------------
  // executeAgentNode
  // -------------------------------------------------------------------------

  private async executeAgentNode(
    node: WorkflowNode,
    context: GraphExecutionContext,
  ): Promise<string> {
    const modelRouter = ServiceRegistry.getInstance().resolve<any>(SERVICE_TOKENS.ModelRouter)

    const role = (node.config?.role as string | undefined) ?? 'coordinator'
    const systemPrompt = ROLE_PROMPTS[role] ?? ROLE_PROMPTS['coordinator']
    const userInput = context.input ?? 'Begin.'

    const messages = [
      {
        id: crypto.randomUUID(),
        agentId: 'graph-executor',
        role: 'system' as any,
        content: systemPrompt,
        timestamp: Date.now(),
      },
      {
        id: crypto.randomUUID(),
        agentId: 'graph-executor',
        role: 'user' as any,
        content: userInput,
        timestamp: Date.now(),
      },
    ]

    const chunks: string[] = []
    for await (const chunk of modelRouter.route(DEFAULT_MODEL_CONFIG, messages)) {
      if (chunk.content) chunks.push(chunk.content)
      if (chunk.isDone) break
    }

    return chunks.join('')
  }

  // -------------------------------------------------------------------------
  // executeToolNode
  // -------------------------------------------------------------------------

  private async executeToolNode(node: WorkflowNode): Promise<unknown> {
    const mcpService = ServiceRegistry.getInstance().resolve<any>(SERVICE_TOKENS.MCPService)

    const toolName = node.config?.toolName as string | undefined
    if (!toolName) {
      console.error(`[GraphExecutor] Tool node "${node.id}" has no toolName in config`)
      return null
    }

    const args = (node.config?.args as Record<string, unknown> | undefined) ?? {}
    const result = await mcpService.executeTool(toolName, args)
    return result
  }

  // -------------------------------------------------------------------------
  // executeConditionNode
  // -------------------------------------------------------------------------

  private executeConditionNode(
    node: WorkflowNode,
    context: GraphExecutionContext,
  ): boolean {
    const condition = node.config?.condition as string | undefined

    if (!condition || condition.trim() === '') {
      return true
    }

    try {
      // eslint-disable-next-line no-new-func
      return Boolean(new Function('context', `return Boolean(${condition})`)(context))
    } catch (err) {
      console.error(`[GraphExecutor] Condition evaluation failed for node "${node.id}":`, err)
      return true
    }
  }
}
