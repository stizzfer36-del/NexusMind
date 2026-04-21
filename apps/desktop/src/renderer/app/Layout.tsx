import React, { useState } from 'react'
import styles from './Layout.module.css'

interface LayoutProps {
  sidebar: React.ReactNode
  main: React.ReactNode
  rightPanel?: React.ReactNode
  modelSelector?: React.ReactNode
}

export function Layout({ sidebar, main, rightPanel, modelSelector }: LayoutProps) {
  const [rightOpen, setRightOpen] = useState(true)

  return (
    <div className={styles.root}>
      {/* Top bar */}
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <div className={styles.appIcon} aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" fill="var(--color-accent)" opacity="0.9" />
              <path d="M5 8l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className={styles.appTitle}>NexusMind</span>
        </div>
        <div className={styles.topbarCenter}>
          {modelSelector}
        </div>
        <div className={styles.topbarRight}>
          <kbd className={styles.kbdHint}>⌘K</kbd>
          <button
            className={`${styles.panelToggle} ${rightOpen ? styles.panelToggleActive : ''}`}
            onClick={() => setRightOpen(v => !v)}
            title={rightOpen ? 'Close right panel' : 'Open right panel'}
            aria-label="Toggle right panel"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
              <line x1="10" y1="1" x2="10" y2="13" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      </header>

      {/* Content area */}
      <div className={styles.content}>
        {/* Sidebar */}
        <aside className={styles.sidebar}>
          {sidebar}
        </aside>

        {/* Sidebar drag handle */}
        <SidebarHandle />

        {/* Main panel */}
        <main className={styles.main}>
          {main}
        </main>

        {/* Right panel */}
        {rightPanel && (
          <>
            <div className={`${styles.rightPanelHandle} ${rightOpen ? '' : styles.hidden}`} />
            <aside
              className={`${styles.rightPanel} ${rightOpen ? styles.rightPanelOpen : ''}`}
              aria-hidden={!rightOpen}
            >
              {rightPanel}
            </aside>
          </>
        )}
      </div>

      {/* Status bar */}
      <footer className={styles.statusbar}>
        <div className={styles.statusLeft}>
          <span className={styles.statusDot} />
          <span className={styles.statusText}>Connected</span>
        </div>
        <div className={styles.statusCenter} />
        <div className={styles.statusRight}>
          <span className={styles.statusItem}>0 sessions</span>
          <span className={styles.statusSep}>|</span>
          <span className={styles.statusItem}>0 tokens</span>
        </div>
      </footer>
    </div>
  )
}

function SidebarHandle() {
  const [dragging, setDragging] = React.useState(false)

  const handlePointerDown = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(true)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const handlePointerUp = React.useCallback(() => {
    setDragging(false)
  }, [])

  return (
    <div
      className={`${styles.sidebarHandle} ${dragging ? styles.sidebarHandleActive : ''}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      role="separator"
      aria-orientation="vertical"
    />
  )
}
