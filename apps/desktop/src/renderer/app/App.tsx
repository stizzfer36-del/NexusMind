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
import { WorkspaceLauncherPanel } from '../panels/WorkspaceLauncherPanel/WorkspaceLauncherPanel'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { GuardApprovalOverlay } from '../components/GuardApprovalOverlay'

// Catches any render crash in the shell and shows an error instead of blank screen.
class ShellErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ShellErrorBoundary] Shell crashed:', error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#0d0d0d', color: '#e8e8e8', padding: '2rem', gap: '1rem',
        }}>
          <div style={{ color: '#ef4444', fontWeight: 600, fontSize: '1rem' }}>
            Shell failed to render
          </div>
          <pre style={{
            background: '#141414', border: '1px solid #2a2a2a', borderRadius: 6,
            padding: '1rem', fontSize: '0.75rem', maxWidth: 640, overflow: 'auto',
            whiteSpace: 'pre-wrap', color: '#999',
          }}>
            {this.state.error.stack ?? this.state.error.message}
          </pre>
          <button
            style={{
              padding: '8px 20px', background: '#7c6af7', border: 'none',
              borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: '0.85rem',
            }}
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const PANELS: Record<Route, React.ReactNode> = {
  terminal: <ErrorBoundary panelName="Terminal"><TerminalPanel /></ErrorBoundary>,
  kanban: <ErrorBoundary panelName="Kanban"><KanbanPanel /></ErrorBoundary>,
  swarm: <ErrorBoundary panelName="Swarm"><SwarmPanel /></ErrorBoundary>,
  memory: <ErrorBoundary panelName="Memory"><MemoryPanel /></ErrorBoundary>,
  replay: <ErrorBoundary panelName="Replay"><ReplayPanel /></ErrorBoundary>,
  settings: <ErrorBoundary panelName="Settings"><SettingsPanel /></ErrorBoundary>,
  bench: (
    <ErrorBoundary panelName="Bench">
      <div style={{ display: 'flex', height: '100%', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}><BenchPanel /></div>
        <div style={{ flex: 1, minWidth: 0 }}><BenchPanel /></div>
      </div>
    </ErrorBoundary>
  ),
  graph: <ErrorBoundary panelName="Graph"><GraphPanel /></ErrorBoundary>,
  guard: <ErrorBoundary panelName="Guard"><GuardPanel /></ErrorBoundary>,
  voice: <ErrorBoundary panelName="Voice"><VoicePanel /></ErrorBoundary>,
}

function LauncherGate({ children }: { children: React.ReactNode }) {
  const { hasLaunched } = useWorkspaceStore()
  if (!hasLaunched) {
    return <WorkspaceLauncherPanel />
  }
  return <>{children}</>
}

function AppShell() {
  const route = useRoute()
  const navigate = useNavigate()

  console.log('[AppShell] rendering, route=', route)

  return (
    <>
      <Layout
        sidebar={<Sidebar activeRoute={route} onNavigate={navigate} />}
        main={<Router panels={PANELS} />}
        modelSelector={<ModelSelector />}
      />
      <GuardApprovalOverlay />
    </>
  )
}

type View = 'loading' | 'onboarding' | 'shell'

export function App() {
  const [view, setView] = useState<View>('loading')

  useEffect(() => {
    document.title = 'NexusMind'
    if (!window.electronAPI) {
      // Preload not available — default to onboarding so the UI is at least visible.
      setView('onboarding')
      return
    }
    window.electronAPI
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
    <ShellErrorBoundary>
      <RouterProvider>
        <LauncherGate>
          <AppShell />
        </LauncherGate>
      </RouterProvider>
    </ShellErrorBoundary>
  )
}
