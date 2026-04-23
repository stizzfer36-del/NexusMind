import { create } from 'zustand'

export type WorkspaceTemplate = 'solo' | 'pair' | 'squad' | 'swarm'

interface WorkspaceState {
  activeTemplate: WorkspaceTemplate | null
  hasLaunched: boolean
  setTemplate: (t: WorkspaceTemplate) => void
  setHasLaunched: () => void
}

const STORAGE_KEY = 'nexusmind:workspace:hasLaunched'

function readHasLaunched(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function writeHasLaunched(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(value))
  } catch {
    // ignore storage errors
  }
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeTemplate: null,
  hasLaunched: readHasLaunched(),

  setTemplate: (activeTemplate) => set({ activeTemplate }),

  setHasLaunched: () =>
    set(() => {
      writeHasLaunched(true)
      return { hasLaunched: true }
    }),
}))
