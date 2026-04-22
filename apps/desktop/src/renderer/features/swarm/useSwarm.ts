import { useEffect, useCallback } from 'react'
import { useIPC, useIPCEvent } from '../../hooks'
import { useSwarmStore } from '../../stores/swarm.store'
import type { SwarmState, SwarmSession, AgentInfo } from '@nexusmind/shared'

export function useSwarm() {
  const store = useSwarmStore()
  const ipc = useIPC<'swarm:getAgents'>()
  const listIPC = useIPC<'swarm:listSessions'>()

  const fetchAgents = useCallback(async () => {
    store.setAgentsLoading(true)
    store.setAgentsError(null)
    try {
      const agents = await ipc.invoke('swarm:getAgents')
      store.setAgents(agents)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      store.setAgentsError(message)
      console.error('[useSwarm] Failed to fetch agents:', err)
    } finally {
      store.setAgentsLoading(false)
    }
  }, [ipc, store])

  const fetchSessions = useCallback(async () => {
    try {
      const list = await listIPC.invoke('swarm:listSessions')
      store.setSessions(list)
      if (list.length > 0 && !store.selectedSessionId) {
        store.setSelectedSessionId(list[0].id)
      }
    } catch (err) {
      console.error('[useSwarm] Failed to fetch sessions:', err)
    }
  }, [listIPC, store])

  // Load agents on mount and whenever sessions change
  useEffect(() => {
    fetchAgents()
  }, [fetchAgents, store.sessions.length])

  // Load sessions on mount
  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  // Listen for real-time swarm updates
  useIPCEvent('swarm:update', useCallback((payload: SwarmState & { id?: string; activeNode?: string }) => {
    const { id, activeNode: _activeNode, ...state } = payload
    if (!id) return
    store.updateSession(id, (s) => ({
      ...s,
      state: { ...s.state, ...state },
      updatedAt: Date.now(),
    }))
    // Re-fetch agents when state changes since agent statuses may have changed
    fetchAgents()
  }, [store, fetchAgents]))

  // Listen for newly created sessions
  useIPCEvent('swarm:sessionCreated', useCallback((session: SwarmSession) => {
    store.addSession(session)
    store.setSelectedSessionId(session.id)
    fetchAgents()
  }, [store, fetchAgents]))

  return {
    sessions: store.sessions,
    agents: store.agents,
    selectedSessionId: store.selectedSessionId,
    isLoadingAgents: store.isLoadingAgents,
    agentsError: store.agentsError,
    setSelectedSessionId: store.setSelectedSessionId,
    refreshAgents: fetchAgents,
  }
}
