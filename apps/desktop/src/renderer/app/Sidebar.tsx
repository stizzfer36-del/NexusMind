import React, { useCallback, useState } from 'react'
import type { Route } from './Router'
import styles from './Sidebar.module.css'

interface NavItem {
  route: Route
  label: string
  shortcut: string
  icon: React.ReactNode
}

// Inline SVG icons — no external library
const TerminalIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M4 6l3 2-3 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="9" y1="10" x2="12" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
)

const KanbanIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="1.5" width="4" height="7" rx="1" stroke="currentColor" strokeWidth="1.2"/>
    <rect x="6.5" y="1.5" width="3" height="11" rx="1" stroke="currentColor" strokeWidth="1.2"/>
    <rect x="10.5" y="1.5" width="4" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
  </svg>
)

const SwarmIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="5" y="5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M5 3V2M8 3V2M11 3V2M3 5H2M3 8H2M3 11H2M5 13v1M8 13v1M11 13v1M13 5h1M13 8h1M13 11h1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
)

const MemoryIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <ellipse cx="8" cy="8" rx="6" ry="4" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M4 8c0-1.1.9-2 2-2h4a2 2 0 0 1 0 4H6a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth="1.2"/>
    <line x1="8" y1="4" x2="8" y2="12" stroke="currentColor" strokeWidth="1.2"/>
  </svg>
)

const ReplayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M2 8a6 6 0 1 0 1.5-3.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M2 4v4h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M8 5v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
)

const SettingsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
)

const BenchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 12l2-6h6l2 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="3" y1="12" x2="13" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M6 9h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <line x1="8" y1="3" x2="8" y2="6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
)

const CollapseIcon = ({ collapsed }: { collapsed: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }}>
    <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const NAV_ITEMS: NavItem[] = [
  { route: 'terminal', label: 'Terminal', shortcut: '⌘1', icon: <TerminalIcon /> },
  { route: 'kanban', label: 'Kanban', shortcut: '⌘2', icon: <KanbanIcon /> },
  { route: 'swarm', label: 'Swarm', shortcut: '⌘3', icon: <SwarmIcon /> },
  { route: 'memory', label: 'Memory', shortcut: '⌘4', icon: <MemoryIcon /> },
  { route: 'replay', label: 'Replay', shortcut: '⌘5', icon: <ReplayIcon /> },
  { route: 'bench', label: 'Bench', shortcut: '⌘B', icon: <BenchIcon /> },
]

interface SidebarProps {
  activeRoute: Route
  onNavigate: (route: Route) => void
}

export function Sidebar({ activeRoute, onNavigate }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)

  const toggleCollapse = useCallback(() => {
    setCollapsed(v => {
      const next = !v
      // Update the layout CSS variable so the Layout shell responds
      document.documentElement.style.setProperty('--sidebar-width', next ? '48px' : '220px')
      return next
    })
  }, [])

  return (
    <div className={`${styles.root} ${collapsed ? styles.collapsed : ''}`}>
      {/* Main nav */}
      <nav className={styles.nav} role="navigation" aria-label="Main navigation">
        {NAV_ITEMS.map(item => (
          <button
            key={item.route}
            className={`${styles.navItem} ${activeRoute === item.route ? styles.navItemActive : ''}`}
            onClick={() => onNavigate(item.route)}
            title={collapsed ? `${item.label} (${item.shortcut})` : undefined}
            aria-label={item.label}
            aria-current={activeRoute === item.route ? 'page' : undefined}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            {!collapsed && (
              <>
                <span className={styles.navLabel}>{item.label}</span>
                <kbd className={styles.shortcut}>{item.shortcut}</kbd>
              </>
            )}
          </button>
        ))}
      </nav>

      {/* Bottom: settings + collapse */}
      <div className={styles.bottom}>
        <button
          className={`${styles.navItem} ${activeRoute === 'settings' ? styles.navItemActive : ''}`}
          onClick={() => onNavigate('settings')}
          title={collapsed ? 'Settings (⌘,)' : undefined}
          aria-label="Settings"
          aria-current={activeRoute === 'settings' ? 'page' : undefined}
        >
          <span className={styles.navIcon}><SettingsIcon /></span>
          {!collapsed && (
            <>
              <span className={styles.navLabel}>Settings</span>
              <kbd className={styles.shortcut}>⌘,</kbd>
            </>
          )}
        </button>

        <button
          className={styles.collapseBtn}
          onClick={toggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <CollapseIcon collapsed={collapsed} />
        </button>
      </div>
    </div>
  )
}
