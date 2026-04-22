import { create } from 'zustand'
import type { Task, TaskColumn } from '@nexusmind/shared'

export type ColumnFilter = 'all' | TaskColumn

interface KanbanState {
  tasks: Task[]
  selectedColumn: ColumnFilter
  isLoading: boolean
  lastError: string | null

  setTasks: (tasks: Task[]) => void
  setSelectedColumn: (col: ColumnFilter) => void
  setIsLoading: (v: boolean) => void
  setLastError: (e: string | null) => void
  clearError: () => void
}

export const useKanbanStore = create<KanbanState>((set) => ({
  tasks: [],
  selectedColumn: 'all',
  isLoading: false,
  lastError: null,

  setTasks: (tasks) => set((state) => ({ tasks: typeof tasks === 'function' ? (tasks as (prev: Task[]) => Task[])(state.tasks) : tasks })),
  setSelectedColumn: (selectedColumn) => set({ selectedColumn }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setLastError: (lastError) => set({ lastError }),
  clearError: () => set({ lastError: null }),
}))
