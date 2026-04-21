import React, { useCallback, useEffect, useState } from 'react'
import { useIPC, useIPCEvent } from '../../hooks'
import type { SwarmSession, SwarmState } from '@nexusmind/shared'
import styles from './SwarmPanel.module.css'

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

const ROLE_ICONS: Record<string, string> = {
  coordinator: '⚡',
  scout: '🔍',
  builder: '🔨',
  reviewer: '👁',
  tester: '🧪',
  docwriter: '📝',
  architect: '🏗',
}

function fmt(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function SwarmPanel() {
  const [sessions, setSessions] = useState<SwarmSession[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')

  const listIPC = useIPC<'swarm:listSessions'>()
  const startIPC = useIPC<'swarm:start'>()
  const stopIPC = useIPC<'swarm:stop'>()

  const selectedSession = sessions.find(s => s.id === selectedId) ?? null

  // Load sessions on mount
  useEffect(() => {
    listIPC.invoke('swarm:listSessions').then(list => {
      setSessions(list)
      if (list.length > 0) setSelectedId(list[0].id)
    }).catch(console.error)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time swarm state updates
  useIPCEvent('swarm:update', useCallback((state: SwarmState) => {
    setSessions(prev => prev.map(s =>
      s.id === selectedId ? { ...s, state, updatedAt: Date.now() } : s
    ))
  }, [selectedId]))

  const handleNewSession = useCallback(async () => {
    if (!newName.trim()) return
    const defaultConfig: SwarmSession = {
      id: '',
      name: newName.trim(),
      config: {
        maxAgents: 4,
        maxRounds: 10,
        consensusThreshold: 0.75,
        timeoutMs: 60000,
        enableReflection: true,
      },
      state: {
        status: 'idle' as any,
        currentRound: 0,
        agentIds: [],
        messages: [],
        consensusReached: false,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    try {
      const session = await startIPC.invoke('swarm:start', defaultConfig)
      setSessions(prev => [...prev, session])
      setSelectedId(session.id)
      setNewName('')
      setShowNewForm(false)
    } catch (err) {
      console.error('Failed to start swarm session:', err)
    }
  }, [startIPC, newName])

  const handleStop = useCallback(async (sessionId: string) => {
    try {
      await stopIPC.invoke('swarm:stop', sessionId)
      setSessions(prev => prev.map(s =>
        s.id === sessionId
          ? { ...s, state: { ...s.state, status: 'idle' as any }, updatedAt: Date.now() }
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
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>Sessions</span>
          <button
            className={styles.newBtn}
            onClick={() => setShowNewForm(v => !v)}
            title="New session"
          >
            +
          </button>
        </div>

        {showNewForm && (
          <div className={styles.newForm}>
            <input
              className={styles.newInput}
              placeholder="Session name…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleNewSession()
                if (e.key === 'Escape') setShowNewForm(false)
              }}
              autoFocus
            />
            <div className={styles.newActions}>
              <button className={styles.newConfirm} onClick={handleNewSession}>Start</button>
              <button className={styles.newCancel} onClick={() => setShowNewForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div className={styles.sessionList}>
          {sessions.length === 0 ? (
            <div className={styles.emptyList}>No sessions yet</div>
          ) : (
            sessions.map(s => (
              <div
                key={s.id}
                className={`${styles.sessionItem} ${s.id === selectedId ? styles.sessionItemActive : ''}`}
                onClick={() => setSelectedId(s.id)}
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
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Detail view */}
      <div className={styles.detail}>
        {!selectedSession ? (
          <div className={styles.emptyDetail}>
            <div className={styles.emptyIcon}>⚡</div>
            <div className={styles.emptyTitle}>No session selected</div>
            <div className={styles.emptyText}>Create a new swarm session to get started</div>
            <button className={styles.emptyBtn} onClick={() => setShowNewForm(true)}>
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
                {selectedSession.state.status !== 'idle' && selectedSession.state.status !== 'completed' && (
                  <button
                    className={styles.stopBtn}
                    onClick={() => handleStop(selectedSession.id)}
                  >
                    Stop
                  </button>
                )}
              </div>
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

            {/* Agent roster */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Agent Roster</div>
              {selectedSession.state.agentIds.length === 0 ? (
                <div className={styles.noAgents}>No agents assigned</div>
              ) : (
                <div className={styles.agentGrid}>
                  {selectedSession.state.agentIds.map((agentId, i) => {
                    const roles = Object.keys(ROLE_ICONS)
                    const role = roles[i % roles.length]
                    return (
                      <div key={agentId} className={styles.agentCard}>
                        <div className={styles.agentIcon}>{ROLE_ICONS[role]}</div>
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
