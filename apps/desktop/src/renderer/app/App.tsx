import React, { useEffect } from 'react'
import '../styles/app.css'
import { Layout } from './Layout'
import { RouterProvider, Router, useRoute, useNavigate } from './Router'
import type { Route } from './Router'
import { Sidebar } from './Sidebar'
import { ModelSelector } from '../components/ModelSelector'
import { TerminalPanel } from '../panels/TerminalPanel'
import { KanbanPanel } from '../panels/KanbanPanel'
import { SwarmPanel } from '../panels/SwarmPanel'
import { SettingsPanel } from '../panels/SettingsPanel'
import { MemoryPanel } from '../panels/MemoryPanel'

const PANELS: Record<Route, React.ReactNode> = {
  terminal: <TerminalPanel />,
  kanban: <KanbanPanel />,
  swarm: <SwarmPanel />,
  memory: <MemoryPanel />,
  settings: <SettingsPanel />,
  bench: (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      color: '#666',
      fontSize: '13px',
    }}>
      Benchmark suite coming soon
    </div>
  ),
}

function AppContent() {
  const route = useRoute()
  const navigate = useNavigate()

  return (
    <Layout
      sidebar={
        <Sidebar
          activeRoute={route}
          onNavigate={navigate}
        />
      }
      main={<Router panels={PANELS} />}
      modelSelector={<ModelSelector />}
    />
  )
}

export function App() {
  useEffect(() => {
    document.title = 'NexusMind'
  }, [])

  return (
    <RouterProvider>
      <AppContent />
    </RouterProvider>
  )
}
