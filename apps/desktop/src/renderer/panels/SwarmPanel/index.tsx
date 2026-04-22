import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useIPC, useIPCEvent } from '../../hooks'
import { SwarmStatus } from '@nexusmind/shared'
import type { SwarmSession, SwarmState } from '@nexusmind/shared'
import styles from './SwarmPanel.module.css'

const PIPELINE_NODES = ['coordinator', 'builder', 'reviewer', 'tester', 'docwriter', 'END']

function GraphFlow({ activeNode }: { activeNode: string | null }) {
  return (
    <div className={styles.graphFlow}>
      <div className={styles.graphFlowRow}>
        {PIPELINE_NODES.map((node, i) => (
          <React.Fragment key={node}>
            <span
              className={`${styles.graphNode} ${activeNode === node ? styles.graphNodeActive : ''}`}
            >
              {node}
            </span>
            {i < PIPELINE_NODES.length - 1 && (
              <span className={styles.graphEdge}>→</span>
            )}
          </React.Fragment>
        ))}
      </div>
      <div className={styles.graphBackEdges}>
        <span className={styles.graphBackEdge}>reviewer ↩ builder (rejected)</span>
        <span className={styles.graphBackEdge}>tester ↩ builder (failed)</span>
      </div>
    </div>
  )
}

const STATUS_COLORS: Record<string, string> = {
  idle: 'var(--color-text-muted)',
  orchestrating: 'var(--color-accent)',
  executing: 'var(--color-yellow)',
  converging: 'var(--color-blue, #3b82f6)',
  completed: 'var(--color-green)',
  failed: 'var(--color-red)',
}

const STATUS_LABELS: Record<string, string> = {
  idle: 'Idle',
  orchestrating: 'Orchestrating',
  executing: 'Executing',
  converging: 'Converging',
  completed: 'Completed',
  failed: 'Failed',
}

const ROLE_LABELS: Record<string, string> = {
  coordinator: 'coord',
  scout: 'scout',
  builder: 'build',
  reviewer: 'rev',
  tester: 'test',
  docwriter: 'docs',
  architect: 'arch',
}

function fmt(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function SwarmPanel() {
  const [sessions, setSessions] = useState<SwarmSession[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [goalText, setGoalText] = useState('')
  const [agentCount, setAgentCount] = useState(4)
  const [activeNode, setActiveNode] = useState<string | null>(null)

  const selectedIdRef = useRef<string | null>(null)
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  const listIPC = useIPC<'swarm:listSessions'>()
  const startIPC = useIPC<'swarm:start'>()
  const stopIPC = useIPC<'swarm:stop'>()
  const createIPC = useIPC<'swarm:create'>()

  const selectedSession = useMemo(
    () => sessions.find(s => s.id === selectedId) ?? null,
    [sessions, selectedId],
  )

  // Load sessions on mount
  useEffect(() => {
    listIPC.invoke('swarm:listSessions').then(list => {
      setSessions(list)
      if (list.length > 0) setSelectedId(list[0].id)
    }).catch(console.error)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time swarm state updates — use ref so callback never goes stale
  useIPCEvent('swarm:update', useCallback((payload: SwarmState & { id?: string; activeNode?: string }) => {
    const { activeNode: payloadActiveNode, id: _id, ...state } = payload
    setSessions(prev => prev.map(s =>
      s.id === selectedIdRef.current ? { ...s, state, updatedAt: Date.now() } : s
    ))
    if (payloadActiveNode !== undefined) {
      setActiveNode(payloadActiveNode)
    } else {
      const status = state.status
      const derived: Record<string, string> = {
        orchestrating: 'coordinator',
        executing: 'builder',
        converging: 'reviewer',
        completed: 'END',
      }
      setActiveNode(derived[status] ?? null)
    }
  }, []))

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
      setSessions(prev => [...prev, session])
      setSelectedId(session.id)
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
      setSessions(prev => prev.map(s =>
        s.id === sessionId
          ? { ...s, state: { ...s.state, status: SwarmStatus.IDLE }, updatedAt: Date.now() }
          : s
      ))
    } catch (err) {
      console.error('Failed to stop swarm session:', err)
    }
  }, [stopIPC])

  const progress = selectedSession
    ? selectedSession.state.currentRound / Math.max(1, selectedSession.config.maxRounds)
    : 0

  return (
    <div className={styles.root}>
      {/* New Session Modal */}
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
                  min={2}
                  max={8}
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

      {/* Sidebar */}
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
            <div className={styles.emptyList}>No sessions yet</div>
          ) : (
            sessions.map(s => (
              <button
                key={s.id}
                className={`${styles.sessionItem} ${s.id === selectedId ? styles.sessionItemActive : ''}`}
                onClick={() => setSelectedId(s.id)}
                aria-pressed={s.id === selectedId}
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

      {/* Detail view */}
      <div className={styles.detail}>
        {!selectedSession ? (
          <div className={styles.emptyDetail}>
            <div className={styles.emptyIcon}>—</div>
            <div className={styles.emptyTitle}>No session selected</div>
            <div className={styles.emptyText}>Create a new swarm session to get started</div>
            <button className={styles.emptyBtn} onClick={() => setShowModal(true)}>
              New Session
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
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

            {/* Graph flow */}
            <div className={styles.progressSection} style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <GraphFlow activeNode={activeNode} />
            </div>

            {/* Progress */}
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

            {/* Recent output */}
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

            {/* Agent roster */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Agent Roster</div>
              {selectedSession.state.agentIds.length === 0 ? (
                <div className={styles.noAgents}>No agents assigned</div>
              ) : (
                <div className={styles.agentGrid}>
                  {selectedSession.state.agentIds.map((agentId, i) => {
                    const roles = Object.keys(ROLE_LABELS)
                    const role = roles[i % roles.length]
                    return (
                      <div key={agentId} className={styles.agentCard}>
                        <div className={styles.agentIcon}>{ROLE_LABELS[role] ?? role}</div>
                        <div className={styles.agentInfo}>
                          <div className={styles.agentRole}>{role}</div>
                          <div className={styles.agentId}>{agentId.slice(0, 8)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Config */}
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
    </div>
  )
}
