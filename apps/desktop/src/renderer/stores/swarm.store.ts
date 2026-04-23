import { create } from 'zustand'
import type { SwarmSession, AgentInfo } from '@nexusmind/shared'

// ─── Node status for graph visualization ────────────────────────────────────

export type SwarmNodeStatus = 'idle' | 'running' | 'completed' | 'failed' | 'waiting'

export interface SwarmNodeState {
  role: string
  status: SwarmNodeStatus
  output: string
  fileLocks: string[]
  agentId: string
  startedAt: number | null
  completedAt: number | null
}

export interface SwarmEdgeMessage {
  id: string
  from: string
  to: string
  content: string
  timestamp: number
}

interface SwarmStore {
  sessions: SwarmSession[]
  agents: AgentInfo[]
  selectedSessionId: string | null
  isLoadingAgents: boolean
  agentsError: string | null

  activeNode: string | null
  nodeStates: Record<string, SwarmNodeState>
  edgeMessages: SwarmEdgeMessage[]
  selectedNodeId: string | null

  setSessions: (sessions: SwarmSession[]) => void
  addSession: (session: SwarmSession) => void
  updateSession: (id: string, updater: (s: SwarmSession) => SwarmSession) => void
  setSelectedSessionId: (id: string | null) => void
  setAgents: (agents: AgentInfo[]) => void
  setAgentsLoading: (loading: boolean) => void
  setAgentsError: (error: string | null) => void

  setActiveNode: (nodeId: string | null) => void
  setNodeState: (role: string, state: Partial<SwarmNodeState>) => void
  setNodeStates: (states: Record<string, SwarmNodeState>) => void
  addEdgeMessage: (message: SwarmEdgeMessage) => void
  clearEdgeMessages: () => void
  setSelectedNodeId: (id: string | null) => void
  resetGraphState: () => void
}

const INITIAL_NODE_STATES: Record<string, SwarmNodeState> = {
  scout:       { role: 'scout',       status: 'idle', output: '', fileLocks: [], agentId: '', startedAt: null, completedAt: null },
  architect:   { role: 'architect',   status: 'idle', output: '', fileLocks: [], agentId: '', startedAt: null, completedAt: null },
  coordinator: { role: 'coordinator', status: 'idle', output: '', fileLocks: [], agentId: '', startedAt: null, completedAt: null },
  builder:     { role: 'builder',     status: 'idle', output: '', fileLocks: [], agentId: '', startedAt: null, completedAt: null },
  reviewer:    { role: 'reviewer',    status: 'idle', output: '', fileLocks: [], agentId: '', startedAt: null, completedAt: null },
  tester:      { role: 'tester',      status: 'idle', output: '', fileLocks: [], agentId: '', startedAt: null, completedAt: null },
  docwriter:  { role: 'docwriter',   status: 'idle', output: '', fileLocks: [], agentId: '', startedAt: null, completedAt: null },
}

export const useSwarmStore = create<SwarmStore>((set) => ({
  sessions: [],
  agents: [],
  selectedSessionId: null,
  isLoadingAgents: false,
  agentsError: null,

  activeNode: null,
  nodeStates: { ...INITIAL_NODE_STATES },
  edgeMessages: [],
  selectedNodeId: null,

  setSessions: (sessions) => set({ sessions }),
  addSession: (session) => set((state) => {
    if (state.sessions.some((s) => s.id === session.id)) return state
    return { sessions: [...state.sessions, session] }
  }),
  updateSession: (id, updater) => set((state) => ({
    sessions: state.sessions.map((s) => (s.id === id ? updater(s) : s)),
  })),
  setSelectedSessionId: (selectedSessionId) => set({ selectedSessionId }),
  setAgents: (agents) => set({ agents }),
  setAgentsLoading: (isLoadingAgents) => set({ isLoadingAgents }),
  setAgentsError: (agentsError) => set({ agentsError }),

  setActiveNode: (nodeId) => set({ activeNode: nodeId }),
  setNodeState: (role, patch) => set((state) => ({
    nodeStates: {
      ...state.nodeStates,
      [role]: { ...state.nodeStates[role], ...patch },
    },
  })),
  setNodeStates: (states) => set({ nodeStates: states }),
  addEdgeMessage: (message) => set((state) => ({
    edgeMessages: [...state.edgeMessages.slice(-49), message],
  })),
  clearEdgeMessages: () => set({ edgeMessages: [] }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  resetGraphState: () => set({
    activeNode: null,
    nodeStates: { ...INITIAL_NODE_STATES },
    edgeMessages: [],
    selectedNodeId: null,
  }),
}))