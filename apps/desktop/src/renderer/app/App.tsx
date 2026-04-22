import React, { useEffect, useState } from 'react'
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
import { ErrorBoundary } from '../components/ErrorBoundary'

const PANELS: Record<Route, React.ReactNode> = {
  terminal: <ErrorBoundary panelName="Terminal"><TerminalPanel /></ErrorBoundary>,
  kanban: <ErrorBoundary panelName="Kanban"><KanbanPanel /></ErrorBoundary>,
  swarm: <ErrorBoundary panelName="Swarm"><SwarmPanel /></ErrorBoundary>,
  memory: <ErrorBoundary panelName="Memory"><MemoryPanel /></ErrorBoundary>,
  replay: <ErrorBoundary panelName="Replay"><ReplayPanel /></ErrorBoundary>,
  settings: <ErrorBoundary panelName="Settings"><SettingsPanel /></ErrorBoundary>,
  bench: <ErrorBoundary panelName="Bench"><BenchPanel /></ErrorBoundary>,
  graph: <ErrorBoundary panelName="Graph"><GraphPanel /></ErrorBoundary>,
  guard: <ErrorBoundary panelName="Guard"><GuardPanel /></ErrorBoundary>,
  voice: <ErrorBoundary panelName="Voice"><VoicePanel /></ErrorBoundary>,
}

function AppShell() {
  const route = useRoute()
  const navigate = useNavigate()

  return (
    <Layout
      sidebar={<Sidebar activeRoute={route} onNavigate={navigate} />}
      main={<Router panels={PANELS} />}
      modelSelector={<ModelSelector />}
    />
  )
}

type View = 'loading' | 'onboarding' | 'shell'

export function App() {
  const [view, setView] = useState<View>('loading')

  useEffect(() => {
    document.title = 'NexusMind'
    window.nexusAPI
      .invoke('settings:get', 'onboardingComplete')
      .then(complete => setView(complete ? 'shell' : 'onboarding'))
      .catch(() => setView('onboarding'))
  }, [])

  if (view === 'loading') {
    return null
  }

  if (view === 'onboarding') {
    return <OnboardingPanel onComplete={() => setView('shell')} />
  }

  return (
    <RouterProvider>
      <AppShell />
    </RouterProvider>
  )
}
