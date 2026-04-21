// ---------------------------------------------------------------------------
// SwarmGraph — minimal typed state graph engine (no external deps)
// ---------------------------------------------------------------------------

type NodeId = string

type EdgeCondition<S> = (state: S) => boolean

interface GraphNode<S> {
  id: NodeId
  execute: (state: S) => Promise<S>
}

interface GraphEdge<S> {
  from: NodeId
  to: NodeId
  condition?: EdgeCondition<S>
}

const MAX_ITERATIONS = 50

export class SwarmGraph<S> {
  private nodes = new Map<NodeId, GraphNode<S>>()
  private edges = new Map<NodeId, GraphEdge<S>[]>()
  private entryNode: NodeId = ''
  private endNodes = new Set<NodeId>()

  addNode(node: GraphNode<S>): this {
    this.nodes.set(node.id, node)
    return this
  }

  addEdge(edge: GraphEdge<S>): this {
    if (!this.edges.has(edge.from)) {
      this.edges.set(edge.from, [])
    }
    this.edges.get(edge.from)!.push(edge)
    return this
  }

  setEntry(id: NodeId): this {
    this.entryNode = id
    return this
  }

  setEnd(ids: NodeId[]): this {
    ids.forEach(id => this.endNodes.add(id))
    return this
  }

  async run(
    initialState: S,
    onStateChange?: (state: S, nodeId: NodeId) => void,
  ): Promise<S> {
    if (!this.entryNode) throw new Error('[SwarmGraph] No entry node set')

    let state = initialState
    let current = this.entryNode
    let iterations = 0

    while (iterations < MAX_ITERATIONS) {
      iterations++

      if (this.endNodes.has(current)) break

      const node = this.nodes.get(current)
      if (!node) {
        console.warn(`[SwarmGraph] Node not found: ${current}`)
        break
      }

      console.log(`[SwarmGraph] Executing node: ${current} (iteration ${iterations})`)
      state = await node.execute(state)
      onStateChange?.(state, current)

      if (this.endNodes.has(current)) break

      const outgoing = this.edges.get(current) ?? []
      let next: NodeId | null = null

      for (const edge of outgoing) {
        if (!edge.condition || edge.condition(state)) {
          next = edge.to
          break
        }
      }

      if (!next) {
        console.log(`[SwarmGraph] No outgoing edge from ${current} — halting`)
        break
      }

      console.log(`[SwarmGraph] Transition: ${current} → ${next}`)
      current = next
    }

    if (iterations >= MAX_ITERATIONS) {
      console.warn('[SwarmGraph] Max iterations reached — force stopping')
    }

    return state
  }
}

// ---------------------------------------------------------------------------
// AgentGraphState — shared state shape passed through all graph nodes
// ---------------------------------------------------------------------------

export interface AgentGraphState {
  sessionId: string
  goal: string
  tasks: Array<{
    id: string
    title: string
    description: string
    status: 'pending' | 'done' | 'failed'
  }>
  agentOutputs: Array<{
    agentId: string
    role: string
    content: string
    round: number
  }>
  reviewPassed: boolean
  testPassed: boolean
  currentRound: number
  maxRounds: number
  cancelled: boolean
  toolResults: string[]
}
