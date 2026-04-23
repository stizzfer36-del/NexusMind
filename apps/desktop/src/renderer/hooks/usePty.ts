import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { useIPC, useIPCEvent } from './useIPC'
import '@xterm/xterm/css/xterm.css'

export interface CommandBlock {
  id: string
  startLine: number
  output: string
  complete: boolean
  endLine?: number
}

export interface PtySession {
  id: string
  pid: number
  shell: string
  terminal: Terminal
  fitAddon: FitAddon
}

export function usePty() {
  const [sessions, setSessions] = useState<PtySession[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [commandBlocksMap, setCommandBlocksMap] = useState<Record<string, CommandBlock[]>>({})
  const sessionsRef = useRef<Map<string, PtySession>>(new Map())
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const resizeObservers = useRef<Map<string, ResizeObserver>>(new Map())
  const initSentRef = useRef<Set<string>>(new Set())

  const createIPC = useIPC<'pty:create'>()
  const writeIPC = useIPC<'pty:write'>()
  const resizeIPC = useIPC<'pty:resize'>()
  const closeIPC = useIPC<'pty:close'>()

  // Sync sessions array with ref
  useEffect(() => {
    sessionsRef.current.forEach((s, id) => {
      if (!sessions.some((sess) => sess.id === id)) {
        sessionsRef.current.delete(id)
      }
    })
  }, [sessions])

  // Listen for PTY data from main
  useIPCEvent('pty:data', useCallback((payload: { id: string; data: string }) => {
    const session = sessionsRef.current.get(payload.id)
    if (session) {
      session.terminal.write(payload.data)

      // Send shell integration init string once on first data
      if (!initSentRef.current.has(payload.id)) {
        initSentRef.current.add(payload.id)
        writeIPC.invoke('pty:write', payload.id, '\x1b]133;A\x07').catch(() => {})
      }
    }
  }, [writeIPC]))

  // Listen for PTY exit
  useIPCEvent('pty:exit', useCallback((payload: { id: string; code: number }) => {
    const session = sessionsRef.current.get(payload.id)
    if (session) {
      session.terminal.write(`\r\n\x1b[33m[Process exited with code ${payload.code}]\x1b[0m\r\n`)
    }
  }, []))

  const createSession = useCallback(async (shell?: string): Promise<PtySession | null> => {
    try {
      const result = await createIPC.invoke('pty:create', shell)
      if (!result || !('id' in result)) {
        console.error('[usePty] pty:create returned invalid response:', result)
        return null
      }

      const { id, pid, shell: sessionShell } = result

      const terminal = new Terminal({
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
      terminal.loadAddon(fitAddon)

      try {
        terminal.loadAddon(new WebglAddon())
      } catch (err) {
        console.warn('[usePty] WebGL addon unavailable, falling back to canvas:', err)
      }

      terminal.parser.registerOscHandler(133, (data: string) => {
        const code = data.split(';')[0]
        if (code === 'C') {
          const block: CommandBlock = {
            id: crypto.randomUUID(),
            startLine: terminal.buffer.active.cursorY,
            output: '',
            complete: false,
          }
          setCommandBlocksMap((prev) => ({
            ...prev,
            [id]: [...(prev[id] ?? []), block],
          }))
        } else if (code === 'D') {
          setCommandBlocksMap((prev) => {
            const blocks = [...(prev[id] ?? [])]
            let lastIncomplete = -1
            for (let i = blocks.length - 1; i >= 0; i--) {
              if (!blocks[i].complete) {
                lastIncomplete = i
                break
              }
            }
            if (lastIncomplete !== -1) {
              blocks[lastIncomplete] = {
                ...blocks[lastIncomplete],
                complete: true,
                endLine: terminal.buffer.active.cursorY,
              }
            }
            return { ...prev, [id]: blocks }
          })
        }
        return true
      })

      terminal.onData((data) => {
        writeIPC.invoke('pty:write', id, data).catch(() => {})
      })

      const session: PtySession = {
        id,
        pid,
        shell: sessionShell,
        terminal,
        fitAddon,
      }

      sessionsRef.current.set(id, session)
      setSessions((prev) => [...prev, session])
      setActiveId(id)

      return session
    } catch (err) {
      console.error('[usePty] Failed to create PTY session:', err)
      return null
    }
  }, [createIPC, writeIPC])

  const attachRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      containerRefs.current.set(id, el)
    } else {
      containerRefs.current.delete(id)
    }
  }, [])

  // Open terminal in DOM when it becomes active
  useEffect(() => {
    if (!activeId) return
    const session = sessionsRef.current.get(activeId)
    const container = containerRefs.current.get(activeId)
    if (!session || !container) return

    if (container.children.length === 0) {
      session.terminal.open(container)
      session.fitAddon.fit()
      session.terminal.focus()
    }
  }, [activeId, sessions])

  // Resize observer for active terminal
  useEffect(() => {
    if (!activeId) return
    const container = containerRefs.current.get(activeId)
    const session = sessionsRef.current.get(activeId)
    if (!container || !session) return

    // Disconnect any existing observer for this session
    const existing = resizeObservers.current.get(activeId)
    if (existing) existing.disconnect()

    const ro = new ResizeObserver(() => {
      try {
        session.fitAddon.fit()
        const dims = session.fitAddon.proposeDimensions()
        if (dims) {
          resizeIPC.invoke('pty:resize', activeId, dims.cols, dims.rows).catch(() => {})
        }
      } catch {
        // ignore resize errors during transitions
      }
    })
    ro.observe(container)
    resizeObservers.current.set(activeId, ro)

    return () => {
      ro.disconnect()
      resizeObservers.current.delete(activeId)
    }
  }, [activeId, resizeIPC])

  const closeSession = useCallback((id: string) => {
    closeIPC.invoke('pty:close', id).catch(() => {})

    const session = sessionsRef.current.get(id)
    if (session) {
      session.terminal.dispose()
      sessionsRef.current.delete(id)
    }

    const ro = resizeObservers.current.get(id)
    if (ro) {
      ro.disconnect()
      resizeObservers.current.delete(id)
    }

    containerRefs.current.delete(id)
    initSentRef.current.delete(id)
    setCommandBlocksMap((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })

    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id)
      if (activeId === id) {
        setActiveId(next.length > 0 ? next[next.length - 1].id : null)
      }
      return next
    })
  }, [closeIPC, activeId])

  // Cleanup all sessions on unmount
  useEffect(() => {
    return () => {
      sessionsRef.current.forEach((s) => s.terminal.dispose())
      resizeObservers.current.forEach((ro) => ro.disconnect())
    }
  }, [])

  return {
    sessions,
    activeId,
    createSession,
    closeSession,
    setActiveId,
    attachRef,
    getSession: (id: string) => sessionsRef.current.get(id) ?? null,
    commandBlocksMap,
  }
}
