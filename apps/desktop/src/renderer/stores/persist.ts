import { StateCreator, StoreMutatorIdentifier } from 'zustand'

// IPC wrapper for renderer process
const ipc = {
  invoke: async (channel: string, ...args: any[]): Promise<any> => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.ipcRenderer) {
      return (window as any).electronAPI.ipcRenderer.invoke(channel, ...args)
    }
    throw new Error('IPC not available')
  },
}

type PersistImpl = <T>(
  storeName: string,
  storeInitializer: StateCreator<T, [], []>
) => StateCreator<T, [], []>

type Write<T, U> = {
  (): T
  <K extends keyof U>(key: K): U[K]
}

export type PersistOptions = {
  name: string
  partialize?: (state: any) => any
  version?: number
  migrate?: (persistedState: any, version: number) => any
}

type Persist = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  initializer: StateCreator<T, Mps, Mcs>,
  options: PersistOptions
) => StateCreator<T, Mps, Mcs>

type PersistImpl2 = <T>(
  storeInitializer: StateCreator<T, [], []>,
  options: PersistOptions
) => StateCreator<T, [], []>

const persistImpl: PersistImpl2 = (fn, options) => (set, get, api) => {
  type S = ReturnType<typeof fn>
  
  const { name, partialize = (s: any) => s } = options
  
  // Load persisted state on init
  const loadPersistedState = async () => {
    try {
      const persistedState = await ipc.invoke('state:load', name)
      if (persistedState) {
        set({ ...get(), ...persistedState } as S, false)
      }
    } catch (err) {
      console.warn(`[persist] Failed to load state for ${name}:`, err)
    }
  }
  
  // Wrap set to persist changes
  const persistedSet: typeof set = (partial, replace) => {
    set(partial as any, replace as any)
    
    // Debounce save
    debouncedSave(name, partialize(get()))
  }
  
  // Create store
  const store = fn(persistedSet, get, api)
  
  // Load initial state
  loadPersistedState()
  
  return store
}

// Debounced save map
const debounceMap = new Map<string, ReturnType<typeof setTimeout>>()

const debouncedSave = (name: string, state: any) => {
  const existing = debounceMap.get(name)
  if (existing) {
    clearTimeout(existing)
  }
  
  const timeout = setTimeout(async () => {
    try {
      await ipc.invoke('state:save', name, state)
    } catch (err) {
      console.warn(`[persist] Failed to save state for ${name}:`, err)
    }
    debounceMap.delete(name)
  }, 500) // 500ms debounce
  
  debounceMap.set(name, timeout)
}

export const persist = persistImpl as unknown as Persist
