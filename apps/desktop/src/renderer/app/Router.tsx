import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'

export type Route = 'terminal' | 'kanban' | 'swarm' | 'memory' | 'replay' | 'settings' | 'bench'

const VALID_ROUTES: Route[] = ['terminal', 'kanban', 'swarm', 'memory', 'replay', 'settings', 'bench']
const DEFAULT_ROUTE: Route = 'terminal'

function parseHash(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '')
  return VALID_ROUTES.includes(hash as Route) ? (hash as Route) : DEFAULT_ROUTE
}

// ─── Context ───────────────────────────────────────────────────────────────

interface RouterContextValue {
  route: Route
  navigate: (route: Route) => void
}

const RouterContext = createContext<RouterContextValue | null>(null)

// ─── Provider ──────────────────────────────────────────────────────────────

interface RouterProviderProps {
  children: React.ReactNode
}

export function RouterProvider({ children }: RouterProviderProps) {
  const [route, setRoute] = useState<Route>(parseHash)

  useEffect(() => {
    function onHashChange() {
      setRoute(parseHash())
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = useCallback((next: Route) => {
    window.location.hash = next
  }, [])

  return (
    <RouterContext.Provider value={{ route, navigate }}>
      {children}
    </RouterContext.Provider>
  )
}

// ─── Hooks ─────────────────────────────────────────────────────────────────

export function useRoute(): Route {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error('useRoute must be used within RouterProvider')
  return ctx.route
}

export function useNavigate(): (route: Route) => void {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error('useNavigate must be used within RouterProvider')
  return ctx.navigate
}

// ─── Router component ──────────────────────────────────────────────────────

interface RouterProps {
  panels: Partial<Record<Route, React.ReactNode>>
}

export function Router({ panels }: RouterProps) {
  const route = useRoute()
  const panel = panels[route]

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {panel ?? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#666',
          fontSize: '13px',
        }}>
          Panel coming soon
        </div>
      )}
    </div>
  )
}
