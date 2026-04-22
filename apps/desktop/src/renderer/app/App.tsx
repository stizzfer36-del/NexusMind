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
import { ReplayPanel } from '../panels/ReplayPanel'
import { BenchPanel } from '../panels/BenchPanel'
import { GraphPanel } from '../panels/GraphPanel'
import { GuardPanel } from '../panels/GuardPanel'
import { VoicePanel } from '../panels/VoicePanel'
import { OnboardingPanel } from '../panels/OnboardingPanel'

const PANELS: Record<Route, React.ReactNode> = {
  terminal: <TerminalPanel />,
  kanban: <KanbanPanel />,
  swarm: <SwarmPanel />,
  memory: <MemoryPanel />,
  replay: <ReplayPanel />,
  settings: <SettingsPanel />,
  bench: <BenchPanel />,
  graph: <GraphPanel />,
  guard: <GuardPanel />,
  voice: <VoicePanel />,
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

  const isOnboarding = window.location.hash === '#onboarding'

  if (isOnboarding) {
    return <OnboardingPanel />
  }

  return (
    <RouterProvider>
      <AppContent />
    </RouterProvider>
  )
}
