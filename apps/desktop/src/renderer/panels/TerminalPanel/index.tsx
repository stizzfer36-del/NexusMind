import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
// TODO: install @xterm/addon-clipboard for native clipboard support
// import { ClipboardAddon } from '@xterm/addon-clipboard'
import '@xterm/xterm/css/xterm.css'
import { useIPC, useIPCEvent } from '../../hooks'
import styles from './TerminalPanel.module.css'

interface TerminalSession {
  id: string
  pid: number
  shell: string
  terminal: Terminal
  fitAddon: FitAddon
}

interface ContextMenuState {
  x: number
  y: number
  sessionId: string
}

export function TerminalPanel() {
  const [sessions, setSessions] = useState<TerminalSession[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const terminalRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const sessionsRef = useRef<Map<string, TerminalSession>>(new Map())
  const { invoke } = useIPC<'terminal:spawn'>()
  const writeIPC = useIPC<'terminal:write'>()
  const resizeIPC = useIPC<'terminal:resize'>()
  const killIPC = useIPC<'terminal:kill'>()

  // Close context menu on click elsewhere
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu])

  // Spawn a new terminal session
  const spawnSession = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electronAPI?.invoke) {
      console.warn('IPC bridge not ready')
      return
    }
    try {
      const result = await invoke('terminal:spawn', '/bin/bash')
      if (!result || !('id' in result) || !(result as any).id) {
        console.error('[TerminalPanel] terminal:spawn returned invalid response — is PtyManager running?', result)
        return
      }
      const session = result as { id: string; pid: number; shell: string }
      const term = new Terminal({
        theme: {
          background: '#0d0d0d',
          foreground: '#e8e8e8',
          cursor: '#7c6af7',
          cursorAccent: '#0d0d0d',
          selectionBackground: 'rgba(124, 106, 247, 0.3)',
          black: '#1e1e1e',
          brightBlack: '#666666',
          red: '#ef4444',
          brightRed: '#f87171',
          green: '#22c55e',
          brightGreen: '#4ade80',
          yellow: '#f59e0b',
          brightYellow: '#fbbf24',
          blue: '#3b82f6',
          brightBlue: '#60a5fa',
          magenta: '#7c6af7',
          brightMagenta: '#a78bfa',
          cyan: '#06b6d4',
          brightCyan: '#22d3ee',
          white: '#e8e8e8',
          brightWhite: '#f5f5f5',
        },
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        fontSize: 13,
        lineHeight: 1.4,
        cursorBlink: true,
        cursorStyle: 'bar',
        scrollback: 5000,
        allowProposedApi: true,
      })
      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      // TODO: load ClipboardAddon when package is installed
      // term.loadAddon(new ClipboardAddon())

      term.onData((data) => {
        if (typeof window !== 'undefined' && window.electronAPI?.invoke) {
          writeIPC.invoke('terminal:write', { id: session.id, data })
        }
      })

      const newSession: TerminalSession = {
        id: session.id,
        pid: session.pid,
        shell: session.shell,
        terminal: term,
        fitAddon,
      }

      sessionsRef.current.set(session.id, newSession)
      setSessions(prev => [...prev, newSession])
      setActiveId(session.id)
    } catch (err) {
      console.error('Failed to spawn terminal:', err)
    }
  }, [invoke, writeIPC])

  // Initial session on mount
  useEffect(() => {
    spawnSession()
    return () => {
      // Kill all sessions on unmount
      sessionsRef.current.forEach((s) => {
        s.terminal.dispose()
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Attach terminal to DOM when active changes
  useEffect(() => {
    if (!activeId) return
    const session = sessionsRef.current.get(activeId)
    const container = terminalRefs.current.get(activeId)
    if (!session || !container) return

    // Only open if not already opened
    if (container.children.length === 0) {
      session.terminal.open(container)
      session.fitAddon.fit()
      session.terminal.focus()
    }
  }, [activeId, sessions])

  // Handle PTY data push
  useIPCEvent('terminal:data', useCallback((payload: { id: string; data: string }) => {
    const session = sessionsRef.current.get(payload.id)
    if (session) {
      session.terminal.write(payload.data)
    }
  }, []))

  // Handle PTY exit
  useIPCEvent('terminal:exit', useCallback((payload: { id: string; code: number }) => {
    const session = sessionsRef.current.get(payload.id)
    if (session) {
      session.terminal.write(`\r\n\x1b[33m[Process exited with code ${payload.code}]\x1b[0m\r\n`)
    }
  }, []))

  // Resize observer per active terminal
  useEffect(() => {
    if (!activeId) return
    const container = terminalRefs.current.get(activeId)
    const session = sessionsRef.current.get(activeId)
    if (!container || !session) return

    const ro = new ResizeObserver(() => {
      try {
        session.fitAddon.fit()
        const dims = session.fitAddon.proposeDimensions()
        if (dims && typeof window !== 'undefined' && window.electronAPI?.invoke) {
          resizeIPC.invoke('terminal:resize', { id: activeId, cols: dims.cols, rows: dims.rows })
        }
      } catch {
        // ignore resize errors during transitions
      }
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [activeId, sessions, resizeIPC])

  const closeSession = useCallback((id: string) => {
    if (typeof window !== 'undefined' && window.electronAPI?.invoke) {
      killIPC.invoke('terminal:kill', id)
    }
    const session = sessionsRef.current.get(id)
    if (session) {
      session.terminal.dispose()
      sessionsRef.current.delete(id)
    }
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id)
      if (activeId === id) {
        setActiveId(next.length > 0 ? next[next.length - 1].id : null)
      }
      return next
    })
  }, [activeId, killIPC])

  const handleContextMenu = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, sessionId })
  }, [])

  const handleCopy = useCallback(() => {
    if (!contextMenu) return
    const session = sessionsRef.current.get(contextMenu.sessionId)
    if (session) {
      const text = session.terminal.getSelection()
      if (text) navigator.clipboard.writeText(text).catch(() => {})
    }
    setContextMenu(null)
  }, [contextMenu])

  const handlePaste = useCallback(() => {
    if (!contextMenu) return
    const session = sessionsRef.current.get(contextMenu.sessionId)
    if (!session) return
    navigator.clipboard.readText()
      .then((text) => {
        session.terminal.paste(text)
        if (typeof window !== 'undefined' && window.electronAPI?.invoke) {
          writeIPC.invoke('terminal:write', { id: contextMenu.sessionId, data: text })
        }
      })
      .catch(() => {})
    setContextMenu(null)
  }, [contextMenu, writeIPC])

  return (
    <div className={styles.root}>
      {/* Tab bar */}
      <div className={styles.tabBar}>
        {sessions.map((s, i) => (
          <div
            key={s.id}
            className={`${styles.tab} ${s.id === activeId ? styles.tabActive : ''}`}
            onClick={() => setActiveId(s.id)}
            role="tab"
            aria-selected={s.id === activeId}
          >
            <span className={styles.tabIcon}>$</span>
            <span className={styles.tabLabel}>Terminal {i + 1}</span>
            <button
              className={styles.tabClose}
              onClick={(e) => { e.stopPropagation(); closeSession(s.id) }}
              aria-label="Close terminal"
            >
              ×
            </button>
          </div>
        ))}
        <button
          className={styles.newTabBtn}
          onClick={spawnSession}
          title="New terminal"
          aria-label="Open new terminal"
        >
          +
        </button>
      </div>

      {/* Terminal containers */}
      <div className={styles.terminalArea}>
        {sessions.length === 0 ? (
          <div className={styles.empty}>
            <span>No terminal sessions</span>
            <button className={styles.emptyBtn} onClick={spawnSession}>Open terminal</button>
          </div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className={`${styles.termContainer} ${s.id === activeId ? styles.termContainerActive : ''}`}
              ref={(el) => {
                if (el) terminalRefs.current.set(s.id, el)
                else terminalRefs.current.delete(s.id)
              }}
              onContextMenu={(e) => handleContextMenu(e, s.id)}
            />
          ))
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button className={styles.contextMenuItem} onClick={handleCopy}>Copy</button>
          <div className={styles.contextMenuDivider} />
          <button className={styles.contextMenuItem} onClick={handlePaste}>Paste</button>
        </div>
      )}
    </div>
  )
}
