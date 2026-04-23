import React, { useCallback, useMemo, useState } from 'react'
import { useIPC } from '../../hooks'
import { useSwarm } from '../../features/swarm/useSwarm'
import { SwarmStatus } from '@nexusmind/shared'
import { SwarmGraph } from './SwarmGraph'
import type { SwarmNodeState } from '../../stores/swarm.store'
import styles from './SwarmPanel.module.css'

const STATUS_COLORS: Record<string, string> = {
  idle: 'var(--color-text-muted)',
  initializing: 'var(--color-accent)',
  orchestrating: 'var(--color-accent)',
  executing: 'var(--color-yellow)',
  converging: 'var(--color-blue, #3b82f6)',
  completed: 'var(--color-green)',
  failed: 'var(--color-red)',
}

const STATUS_LABELS: Record<string, string> = {
  idle: 'Idle',
  initializing: 'Initializing',
  orchestrating: 'Orchestrating',
  executing: 'Executing',
  converging: 'Converging',
  completed: 'Completed',
  failed: 'Failed',
}

const ROLE_META: Record<string, { label: string; icon: string; color: string }> = {
  scout:       { label: 'Scout',       icon: '🔍', color: 'var(--swarm-scout, #60a5fa)' },
  architect:   { label: 'Architect',   icon: '📐', color: 'var(--swarm-architect, #a78bfa)' },
  coordinator: { label: 'Coordinator', icon: '🎯', color: 'var(--swarm-coordinator, #f472b6)' },
  builder:     { label: 'Builder',     icon: '🔨', color: 'var(--swarm-builder, #fbbf24)' },
  reviewer:    { label: 'Reviewer',    icon: '👁', color: 'var(--swarm-reviewer, #34d399)' },
  tester:      { label: 'Tester',      icon: '🧪', color: 'var(--swarm-tester, #f87171)' },
  docwriter:   { label: 'DocWriter',   icon: '📝', color: 'var(--swarm-docwriter, #38bdf8)' },
}

function fmt(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function NodeDetailPanel({ nodeState, onClose }: { nodeState: SwarmNodeState | null; onClose: () => void }) {
  if (!nodeState) return null
  const meta = ROLE_META[nodeState.role] ?? { label: nodeState.role, icon: '⚙', color: 'var(--color-accent)' }

  return (
    <div className={styles.nodeDetail}>
      <div className={styles.nodeDetailHeader}>
        <div className={styles.nodeDetailTitleRow}>
          <span className={styles.nodeDetailIcon}>{meta.icon}</span>
          <span className={styles.nodeDetailTitle}>{meta.label}</span>
          <span
            className={styles.statusBadge}
            style={{
              color: STATUS_COLORS[nodeState.status] ?? 'var(--color-text-muted)',
              borderColor: STATUS_COLORS[nodeState.status] ?? 'var(--color-border)',
            }}
          >
            {nodeState.status}
          </span>
        </div>
        <button className={styles.nodeDetailClose} onClick={onClose} aria-label="Close detail panel">×</button>
      </div>

      {nodeState.agentId && (
        <div className={styles.nodeDetailSection}>
          <div className={styles.sectionTitle}>Agent ID</div>
          <div className={styles.monoText}>{nodeState.agentId}</div>
        </div>
      )}

      {nodeState.startedAt && (
        <div className={styles.nodeDetailSection}>
          <div className={styles.sectionTitle}>Started</div>
          <div>{fmt(nodeState.startedAt)}</div>
        </div>
      )}

      {nodeState.completedAt && (
        <div className={styles.nodeDetailSection}>
          <div className={styles.sectionTitle}>Completed</div>
          <div>{fmt(nodeState.completedAt)}</div>
        </div>
      )}

      {nodeState.fileLocks.length > 0 && (
        <div className={styles.nodeDetailSection}>
          <div className={styles.sectionTitle}>File Locks</div>
          <div className={styles.fileLockList}>
            {nodeState.fileLocks.map((f, i) => (
              <div key={i} className={styles.fileLockItem}>{f}</div>
            ))}
          </div>
        </div>
      )}

      {nodeState.output && (
        <div className={styles.nodeDetailSection}>
          <div className={styles.sectionTitle}>Output</div>
          <div className={styles.outputBlock}>{nodeState.output}</div>
        </div>
      )}
    </div>
  )
}

export function SwarmPanel() {
  const {
    sessions,
    agents,
    selectedSessionId,
    setSelectedSessionId,
    activeNode,
    nodeStates,
    edgeMessages,
    selectedNodeId,
    setSelectedNodeId,
  } = useSwarm()

  const [showModal, setShowModal] = useState(false)
  const [goalText, setGoalText] = useState('')
  const [agentCount, setAgentCount] = useState(4)

  const startIPC = useIPC<'swarm:start'>()
  const stopIPC = useIPC<'swarm:stop'>()
  const createIPC = useIPC<'swarm:create'>()

  const selectedSession = useMemo(
    () => sessions.find(s => s.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  )

  const sessionAgents = useMemo(
    () => selectedSession ? agents.filter(a => a.sessionId === selectedSession.id) : [],
    [agents, selectedSession],
  )

  const selectedNodeState = useMemo(() => {
    if (!selectedNodeId) return null
    return nodeStates[selectedNodeId] ?? null
  }, [selectedNodeId, nodeStates])

  const handleLaunch = useCallback(async () => {
    if (!goalText.trim()) return
    try {
      const session = await createIPC.invoke('swarm:create', {
        maxAgents: agentCount,
        maxRounds: 10,
        consensusThreshold: 0.75,
        timeoutMs: 120000,
        enableReflection: true,
      }, goalText.trim())

      if (!session || !('id' in session)) {
        console.error('[SwarmPanel] swarm:create returned invalid response:', session)
        return
      }

      await startIPC.invoke('swarm:start', session)
      setGoalText('')
      setAgentCount(4)
      setShowModal(false)
    } catch (err) {
      console.error('[SwarmPanel] Failed to start swarm session:', err)
    }
  }, [createIPC, startIPC, goalText, agentCount])

  const handleStop = useCallback(async (sessionId: string) => {
    try {
      await stopIPC.invoke('swarm:stop', sessionId)
    } catch (err) {
      console.error('Failed to stop swarm session:', err)
    }
  }, [stopIPC])

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId(prev => prev === nodeId ? null : nodeId)
  }, [setSelectedNodeId])

  const progress = selectedSession
    ? selectedSession.state.currentRound / Math.max(1, selectedSession.config.maxRounds)
    : 0

  return (
    <div className={styles.root}>
      {showModal && (
        <div className={styles.modal}>
          <div className={styles.modalOverlay} onClick={() => setShowModal(false)} />
          <div
            className={styles.modalCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="swarm-modal-title"
          >
            <div id="swarm-modal-title" className={styles.modalTitle}>New Swarm Session</div>
            <div className={styles.modalBody}>
              <label className={styles.sectionTitle}>What should the swarm work on?</label>
              <input
                className={styles.goalInput}
                placeholder="Describe the goal…"
                value={goalText}
                onChange={e => setGoalText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleLaunch()
                  if (e.key === 'Escape') setShowModal(false)
                }}
                autoFocus
              />
              <div className={styles.sliderRow}>
                <span className={styles.sectionTitle}>Agents</span>
                <input
                  className={styles.slider}
                  type="range"
                  min={1}
                  max={16}
                  value={agentCount}
                  onChange={e => setAgentCount(Number(e.target.value))}
                />
                <span className={styles.sliderVal}>{agentCount}</span>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.newCancel} onClick={() => setShowModal(false)}>Cancel</button>
              <button
                className={styles.launchBtn}
                onClick={handleLaunch}
                disabled={!goalText.trim()}
              >
                Launch Swarm
              </button>
            </div>
          </div>
        </div>
      )}

      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>Sessions</span>
          <button
            className={styles.newBtn}
            onClick={() => setShowModal(true)}
            title="New session"
            aria-label="New session"
          >
            +
          </button>
        </div>

        <div className={styles.sessionList}>
          {sessions.length === 0 ? (
            <div className={styles.emptyList}>
              <div>No swarm sessions yet</div>
              <div className={styles.emptySub}>Launch one to coordinate multiple agents on a goal</div>
              <button className={styles.emptyBtn} onClick={() => setShowModal(true)}>Launch Swarm</button>
            </div>
          ) : (
            sessions.map(s => (
              <button
                key={s.id}
                className={`${styles.sessionItem} ${s.id === selectedSessionId ? styles.sessionItemActive : ''}`}
                onClick={() => setSelectedSessionId(s.id)}
                aria-pressed={s.id === selectedSessionId}
                aria-label={`${s.name}, ${STATUS_LABELS[s.state.status] ?? s.state.status}, ${s.state.agentIds.length} agents`}
              >
                <div className={styles.sessionItemHeader}>
                  <span className={styles.sessionName}>{s.name}</span>
                  <span
                    className={styles.statusBadge}
                    style={{ color: STATUS_COLORS[s.state.status] ?? 'var(--color-text-muted)', borderColor: STATUS_COLORS[s.state.status] ?? 'var(--color-border)' }}
                  >
                    {STATUS_LABELS[s.state.status] ?? s.state.status}
                  </span>
                </div>
                <div className={styles.sessionMeta}>
                  <span>{s.state.agentIds.length} agents</span>
                  <span>{fmt(s.createdAt)}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      <div className={styles.detail}>
        {!selectedSession ? (
          <div className={styles.emptyDetail}>
            <div className={styles.emptyIcon}>◈</div>
            <div className={styles.emptyTitle}>No session selected</div>
            <div className={styles.emptyText}>Create a new swarm session to get started</div>
            <button className={styles.emptyBtn} onClick={() => setShowModal(true)}>
              New Session
            </button>
          </div>
        ) : (
          <>
            <div className={styles.detailHeader}>
              <div className={styles.detailTitleRow}>
                <h2 className={styles.detailTitle}>{selectedSession.name}</h2>
                <span
                  className={styles.statusBadgeLg}
                  style={{
                    color: STATUS_COLORS[selectedSession.state.status],
                    borderColor: STATUS_COLORS[selectedSession.state.status],
                    background: `${STATUS_COLORS[selectedSession.state.status]}1a`,
                  }}
                >
                  {STATUS_LABELS[selectedSession.state.status] ?? selectedSession.state.status}
                </span>
              </div>
              <div className={styles.detailActions}>
                {selectedSession.state.status !== SwarmStatus.IDLE && selectedSession.state.status !== SwarmStatus.COMPLETED && (
                  <button
                    className={styles.stopBtn}
                    onClick={() => handleStop(selectedSession.id)}
                  >
                    Stop
                  </button>
                )}
              </div>
            </div>

            <div className={styles.graphSection}>
              <SwarmGraph
                nodeStates={nodeStates}
                activeNode={activeNode}
                selectedNodeId={selectedNodeId}
                onNodeClick={handleNodeClick}
                edgeMessages={edgeMessages}
              />
            </div>

            <div className={styles.progressSection}>
              <div className={styles.progressRow}>
                <span className={styles.progressLabel}>
                  Round {selectedSession.state.currentRound} / {selectedSession.config.maxRounds}
                </span>
                <span className={styles.progressLabel}>
                  {selectedSession.state.consensusReached ? '✓ Consensus reached' : 'No consensus yet'}
                </span>
              </div>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{
                    width: `${Math.min(100, progress * 100)}%`,
                    background: selectedSession.state.consensusReached
                      ? 'var(--color-green)'
                      : 'var(--color-accent)',
                  }}
                />
              </div>
            </div>

            {selectedSession.state.messages.length > 0 && (() => {
              const allMessages = selectedSession.state.messages
              const toolCount = allMessages.filter(m => m.includes('[Tool:')).length
              return (
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>
                    Recent Output ({allMessages.length} messages)
                    {toolCount > 0 && (
                      <span className={styles.toolCountBadge}>{toolCount} tool{toolCount !== 1 ? 's' : ''} used</span>
                    )}
                  </div>
                  <div className={styles.messageLog}>
                    {allMessages.slice(-5).map((msg, i) => {
                      const isToolCall = msg.startsWith('[Tool:')
                      const display = msg.slice(0, 200) + (msg.length > 200 ? '…' : '')
                      return (
                        <div
                          key={i}
                          className={`${styles.messageItem} ${isToolCall ? styles.messageItemTool : ''}`}
                        >
                          {isToolCall && <span className={styles.toolIcon}>[tool] </span>}
                          {display}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            <div className={styles.section}>
              <div className={styles.sectionTitle}>Agent Roster</div>
              {sessionAgents.length === 0 ? (
                <div className={styles.noAgents}>No agents assigned</div>
              ) : (
                <div className={styles.agentGrid}>
                  {sessionAgents.map((agent) => {
                    const meta = ROLE_META[agent.role] ?? { label: agent.role, icon: '⚙', color: 'var(--color-accent)' }
                    const nodeState = nodeStates[agent.role]
                    const status = nodeState?.status ?? 'idle'
                    return (
                      <div key={agent.id} className={styles.agentCard} style={{ borderLeftColor: meta.color }}>
                        <div className={styles.agentIcon}>{meta.icon}</div>
                        <div className={styles.agentInfo}>
                          <div className={styles.agentRole}>{meta.label}</div>
                          <div className={styles.agentId}>{agent.id.slice(0, 8)}</div>
                          <span className={`${styles.agentStatus} ${styles[`agentStatus${status.charAt(0).toUpperCase()}${status.slice(1)}`] ?? ''}`}>
                            {status}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>Configuration</div>
              <div className={styles.configGrid}>
                <div className={styles.configItem}>
                  <span className={styles.configKey}>Max Agents</span>
                  <span className={styles.configVal}>{selectedSession.config.maxAgents}</span>
                </div>
                <div className={styles.configItem}>
                  <span className={styles.configKey}>Max Rounds</span>
                  <span className={styles.configVal}>{selectedSession.config.maxRounds}</span>
                </div>
                <div className={styles.configItem}>
                  <span className={styles.configKey}>Consensus</span>
                  <span className={styles.configVal}>{(selectedSession.config.consensusThreshold * 100).toFixed(0)}%</span>
                </div>
                <div className={styles.configItem}>
                  <span className={styles.configKey}>Timeout</span>
                  <span className={styles.configVal}>{selectedSession.config.timeoutMs / 1000}s</span>
                </div>
                <div className={styles.configItem}>
                  <span className={styles.configKey}>Reflection</span>
                  <span className={styles.configVal}>{selectedSession.config.enableReflection ? 'On' : 'Off'}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {selectedNodeState && (
        <NodeDetailPanel
          nodeState={selectedNodeState}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  )
}