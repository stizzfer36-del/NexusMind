import { useEffect, useCallback, useMemo } from 'react'
import { useIPC, useIPCEvent } from '../../hooks'
import { useSwarmStore } from '../../stores/swarm.store'
import { SwarmStatus } from '@nexusmind/shared'
import type { SwarmState, SwarmSession, AgentInfo } from '@nexusmind/shared'
import type { SwarmNodeStatus } from '../../stores/swarm.store'

const PIPELINE_ORDER = ['scout', 'architect', 'coordinator', 'builder', 'reviewer', 'tester', 'docwriter'] as const

function getNodeStatus(role: string, sessionStatus: SwarmStatus, activeNode: string | null, nodeStates: Record<string, { status: SwarmNodeStatus }>): SwarmNodeStatus {
  const nodeState = nodeStates[role]
  if (nodeState && nodeState.status !== 'idle') return nodeState.status
  if (sessionStatus === SwarmStatus.COMPLETED) return 'completed'
  if (sessionStatus === SwarmStatus.FAILED) return 'failed'
  if (sessionStatus === SwarmStatus.IDLE) return 'idle'
  if (activeNode === role) return 'running'
  const roleIndex = PIPELINE_ORDER.indexOf(role as typeof PIPELINE_ORDER[number])
  const activeIndex = PIPELINE_ORDER.indexOf(activeNode as typeof PIPELINE_ORDER[number])
  if (activeIndex >= 0 && roleIndex >= 0 && roleIndex < activeIndex) return 'completed'
  if (activeIndex >= 0 && roleIndex >= 0 && roleIndex > activeIndex) return 'waiting'
  return 'idle'
}

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

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents, store.sessions.length])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  useIPCEvent('swarm:update', useCallback((payload: SwarmState & { id?: string; activeNode?: string }) => {
    const { id, activeNode, ...state } = payload
    if (!id) return

    store.updateSession(id, (s) => ({
      ...s,
      state: { ...s.state, ...state },
      updatedAt: Date.now(),
    }))

    if (activeNode) {
      store.setActiveNode(activeNode)
      store.setNodeState(activeNode, {
        status: 'running',
        startedAt: Date.now(),
      })
      for (const prevRole of PIPELINE_ORDER) {
        if (prevRole === activeNode) break
        const prev = store.nodeStates[prevRole]
        if (prev && prev.status === 'running') {
          store.setNodeState(prevRole, {
            status: 'completed',
            completedAt: Date.now(),
          })
        }
      }
    }

    if (state.status === SwarmStatus.COMPLETED) {
      store.setActiveNode(null)
      for (const role of PIPELINE_ORDER) {
        store.setNodeState(role, { status: 'completed', completedAt: Date.now() })
      }
    } else if (state.status === SwarmStatus.FAILED) {
      store.setActiveNode(null)
      for (const role of PIPELINE_ORDER) {
        const ns = store.nodeStates[role]
        if (ns.status === 'running') {
          store.setNodeState(role, { status: 'failed', completedAt: Date.now() })
        }
      }
    } else if (state.status === SwarmStatus.IDLE) {
      store.resetGraphState()
    }

    fetchAgents()
  }, [store, fetchAgents]))

  useIPCEvent('swarm:sessionCreated', useCallback((session: SwarmSession) => {
    store.addSession(session)
    store.setSelectedSessionId(session.id)
    store.resetGraphState()
    fetchAgents()
  }, [store, fetchAgents]))

  const computedNodeStatuses = useMemo(() => {
    const selectedSession = store.sessions.find(s => s.id === store.selectedSessionId)
    if (!selectedSession) return store.nodeStates

    const result: Record<string, typeof store.nodeStates[string]> = {}
    for (const role of PIPELINE_ORDER) {
      const base = store.nodeStates[role] || { role, status: 'idle' as SwarmNodeStatus, output: '', fileLocks: [], agentId: '', startedAt: null, completedAt: null }
      result[role] = {
        ...base,
        status: getNodeStatus(role, selectedSession.state.status, store.activeNode, store.nodeStates),
      }
    }
    return result
  }, [store.sessions, store.selectedSessionId, store.activeNode, store.nodeStates])

  return {
    sessions: store.sessions,
    agents: store.agents,
    selectedSessionId: store.selectedSessionId,
    isLoadingAgents: store.isLoadingAgents,
    agentsError: store.agentsError,
    setSelectedSessionId: store.setSelectedSessionId,
    refreshAgents: fetchAgents,
    activeNode: store.activeNode,
    nodeStates: computedNodeStatuses,
    edgeMessages: store.edgeMessages,
    selectedNodeId: store.selectedNodeId,
    setSelectedNodeId: store.setSelectedNodeId,
  }
}