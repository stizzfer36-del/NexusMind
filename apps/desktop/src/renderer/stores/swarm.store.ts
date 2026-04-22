import { create } from 'zustand'
import type { SwarmSession, AgentInfo } from '@nexusmind/shared'

interface SwarmStore {
  sessions: SwarmSession[]
  agents: AgentInfo[]
  selectedSessionId: string | null
  isLoadingAgents: boolean
  agentsError: string | null

  setSessions: (sessions: SwarmSession[]) => void
  addSession: (session: SwarmSession) => void
  updateSession: (id: string, updater: (s: SwarmSession) => SwarmSession) => void
  setSelectedSessionId: (id: string | null) => void
  setAgents: (agents: AgentInfo[]) => void
  setAgentsLoading: (loading: boolean) => void
  setAgentsError: (error: string | null) => void
}

export const useSwarmStore = create<SwarmStore>((set) => ({
  sessions: [],
  agents: [],
  selectedSessionId: null,
  isLoadingAgents: false,
  agentsError: null,

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
}))