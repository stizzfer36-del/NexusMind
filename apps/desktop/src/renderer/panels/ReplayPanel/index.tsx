import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useIPC, useIPCEvent } from '../../hooks'
import type { ReplayEvent, ReplaySession } from '@nexusmind/shared'
import styles from './ReplayPanel.module.css'

const EVENT_COLORS: Record<string, string> = {
  'graph:transition': 'var(--color-accent, #7c6af7)',
  'agent:output':     'var(--color-green, #22c55e)',
  'tool:call':        '#f97316',
  'tool:result':      'var(--color-yellow, #f59e0b)',
  'pty:chunk':        'rgba(255,255,255,0.3)',
  'session:start':    'rgba(255,255,255,0.8)',
  'session:end':      'rgba(255,255,255,0.8)',
  'kanban:move':      'var(--color-blue, #3b82f6)',
  'memory:store':     '#ec4899',
}

const EVENT_LABELS: Record<string, string> = {
  'graph:transition': 'Transition',
  'agent:output':     'Output',
  'tool:call':        'Tool Call',
  'tool:result':      'Tool Result',
  'pty:chunk':        'PTY',
  'session:start':    'Start',
  'session:end':      'End',
  'kanban:move':      'Kanban',
  'memory:store':     'Memory',
}

const SPEED_OPTIONS = [1, 5, 10, 50]

function relTime(base: number, ts: number): string {
  const d = ts - base
  return `+${(d / 1000).toFixed(1)}s`
}

export function ReplayPanel() {
  const [sessions, setSessions] = useState<ReplaySession[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [events, setEvents] = useState<ReplayEvent[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const sessionsIPC = useIPC<'replay:getSessions'>()
  const eventsIPC = useIPC<'replay:getEvents'>()
  const deleteIPC = useIPC<'replay:deleteSession'>()

  // Load sessions on mount
  useEffect(() => {
    sessionsIPC.invoke('replay:getSessions').then(setSessions).catch(console.error)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load events when session selected
  useEffect(() => {
    if (!selectedId) return
    eventsIPC.invoke('replay:getEvents', selectedId).then(evts => {
      setEvents(evts)
      setCurrentIndex(0)
      setPlaying(false)
    }).catch(console.error)
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Playback interval
  useEffect(() => {
    if (playIntervalRef.current) clearInterval(playIntervalRef.current)
    if (!playing || events.length === 0) return
    playIntervalRef.current = setInterval(() => {
      setCurrentIndex(i => {
        if (i >= events.length - 1) {
          setPlaying(false)
          return i
        }
        return i + 1
      })
    }, Math.max(50, 1000 / speed))
    return () => { if (playIntervalRef.current) clearInterval(playIntervalRef.current) }
  }, [playing, speed, events.length])

  const handlePlayPause = useCallback(() => setPlaying(p => !p), [])
  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentIndex(Number(e.target.value))
    setPlaying(false)
  }, [])

  const eventDots = useMemo(() => events.map((ev, i) => (
    <div
      key={ev.id}
      className={styles.eventDot}
      style={{
        left: `${(i / Math.max(1, events.length - 1)) * 100}%`,
        background: EVENT_COLORS[ev.type] ?? 'rgba(255,255,255,0.3)',
        opacity: i <= currentIndex ? 1 : 0.3,
      }}
      title={ev.type}
    />
  )), [events, currentIndex])

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await deleteIPC.invoke('replay:deleteSession', id)
    setSessions(prev => prev.filter(s => s.id !== id))
    if (selectedId === id) { setSelectedId(null); setEvents([]) }
  }, [deleteIPC, selectedId])

  const currentEvent = events[currentIndex] ?? null
  const sessionStart = events[0]?.timestamp ?? 0

  return (
    <div className={styles.root}>
      {/* Left: session list */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>Sessions</div>
        {sessions.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>⏮</div>
            <div className={styles.emptyTitle}>No replay sessions yet</div>
            <div className={styles.emptyText}>Complete a swarm session to record one</div>
          </div>
        ) : (
          sessions.map(s => (
            <div
              key={s.id}
              className={`${styles.sessionRow} ${selectedId === s.id ? styles.sessionRowActive : ''}`}
              onClick={() => setSelectedId(s.id)}
            >
              <div className={styles.sessionName}>{s.name}</div>
              <div className={styles.sessionMeta}>
                <span>{s.eventCount} events</span>
                <span>{s.toolCallCount} tools</span>
                <span>{new Date(s.startedAt).toLocaleDateString()}</span>
              </div>
              <button
                className={styles.deleteBtn}
                onClick={e => handleDelete(s.id, e)}
                title="Delete session"
              >×</button>
            </div>
          ))
        )}
      </div>

      {/* Right: timeline */}
      <div className={styles.detail}>
        {!selectedId ? (
          <div className={styles.detailEmpty}>Select a session to replay</div>
        ) : events.length === 0 ? (
          <div className={styles.detailEmpty}>Loading events…</div>
        ) : (
          <>
            {/* Controls */}
            <div className={styles.controls}>
              <button
                className={styles.playBtn}
                onClick={handlePlayPause}
              >
                {playing ? '⏸' : '▶'}
              </button>
              <div className={styles.speedBtns}>
                {SPEED_OPTIONS.map(s => (
                  <button
                    key={s}
                    className={`${styles.speedBtn} ${speed === s ? styles.speedBtnActive : ''}`}
                    onClick={() => setSpeed(s)}
                  >{s}×</button>
                ))}
              </div>
              <span className={styles.counter}>{currentIndex + 1} / {events.length}</span>
            </div>

            {/* Event dot legend + slider */}
            <div className={styles.sliderWrapper}>
              <div className={styles.dotTrack}>
                {eventDots}
              </div>
              <input
                className={styles.slider}
                type="range"
                min={0}
                max={events.length - 1}
                value={currentIndex}
                onChange={handleScrub}
              />
            </div>

            {/* Current event card */}
            {currentEvent && (
              <div className={styles.eventCard}>
                <div className={styles.eventCardHeader}>
                  <span
                    className={styles.eventTypeBadge}
                    style={{ color: EVENT_COLORS[currentEvent.type], borderColor: EVENT_COLORS[currentEvent.type] }}
                  >
                    {EVENT_LABELS[currentEvent.type] ?? currentEvent.type}
                  </span>
                  <span className={styles.eventTime}>{relTime(sessionStart, currentEvent.timestamp)}</span>
                  {currentEvent.nodeId && (
                    <span className={styles.nodeIdBadge}>{currentEvent.nodeId}</span>
                  )}
                  {currentEvent.agentId && (
                    <span className={styles.agentIdBadge}>{currentEvent.agentId.slice(0, 8)}</span>
                  )}
                  {currentEvent.durationMs != null && (
                    <span className={styles.durationBadge}>{currentEvent.durationMs}ms</span>
                  )}
                </div>
                <pre className={styles.payloadBlock}>
                  {JSON.stringify(currentEvent.payload, null, 2).split('\n').slice(0, 20).join('\n')}
                </pre>
              </div>
            )}

            {/* Legend */}
            <div className={styles.legend}>
              {Object.entries(EVENT_LABELS).map(([type, label]) => (
                <span key={type} className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: EVENT_COLORS[type] }} />
                  {label}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
