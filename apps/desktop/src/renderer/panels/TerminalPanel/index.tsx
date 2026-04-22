import React, { useCallback, useEffect, useState } from 'react'
import { usePty } from '../../hooks/usePty'
import styles from './TerminalPanel.module.css'

interface ContextMenuState {
  x: number
  y: number
  sessionId: string
}

export function TerminalPanel() {
  const { sessions, activeId, createSession, closeSession, setActiveId, attachRef, getSession } = usePty()
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  // Close context menu on click elsewhere
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu])

  // Spawn initial session on mount
  useEffect(() => {
    if (sessions.length === 0) {
      createSession('/bin/bash')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, sessionId })
  }, [])

  const handleCopy = useCallback(() => {
    if (!contextMenu) return
    const session = getSession(contextMenu.sessionId)
    if (session) {
      const text = session.terminal.getSelection()
      if (text) navigator.clipboard.writeText(text).catch(() => {})
    }
    setContextMenu(null)
  }, [contextMenu, getSession])

  const handlePaste = useCallback(() => {
    if (!contextMenu) return
    const session = getSession(contextMenu.sessionId)
    if (!session) return
    navigator.clipboard.readText()
      .then((text) => {
        session.terminal.paste(text)
      })
      .catch(() => {})
    setContextMenu(null)
  }, [contextMenu, getSession])

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
          onClick={() => createSession('/bin/bash')}
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
            <button className={styles.emptyBtn} onClick={() => createSession('/bin/bash')}>Open terminal</button>
          </div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className={`${styles.termContainer} ${s.id === activeId ? styles.termContainerActive : ''}`}
              ref={(el) => attachRef(s.id, el)}
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
