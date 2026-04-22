import { create } from 'zustand'
import type { MemoryEntry, MemorySearchResult, MemoryType } from '@nexusmind/shared'

interface MemoryState {
  entries: MemoryEntry[]
  searchResults: MemorySearchResult[]
  query: string
  typeFilter: MemoryType | 'all'
  isLoading: boolean
  lastError: string | null

  setEntries: (entries: MemoryEntry[]) => void
  setSearchResults: (results: MemorySearchResult[]) => void
  setQuery: (q: string) => void
  setTypeFilter: (t: MemoryType | 'all') => void
  setIsLoading: (v: boolean) => void
  setLastError: (e: string | null) => void
  clearError: () => void
}

export const useMemoryStore = create<MemoryState>((set) => ({
  entries: [],
  searchResults: [],
  query: '',
  typeFilter: 'all',
  isLoading: false,
  lastError: null,

  setEntries: (entries) => set({ entries }),
  setSearchResults: (searchResults) => set({ searchResults }),
  setQuery: (query) => set({ query }),
  setTypeFilter: (typeFilter) => set({ typeFilter }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setLastError: (lastError) => set({ lastError }),
  clearError: () => set({ lastError: null }),
}))
