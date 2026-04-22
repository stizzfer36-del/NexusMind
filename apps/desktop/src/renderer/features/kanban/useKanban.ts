import { useCallback, useEffect, useMemo } from 'react'
import { useIPC, useIPCEvent } from '../../hooks'
import { useKanbanStore } from '../../stores/kanban.store'
import type { Task, TaskColumn } from '@nexusmind/shared'

export function useKanban() {
  const store = useKanbanStore()
  const listIPC = useIPC<'kanban:getTasks'>()
  const createIPC = useIPC<'kanban:createTask'>()
  const updateIPC = useIPC<'kanban:updateTask'>()
  const deleteIPC = useIPC<'kanban:deleteTask'>()
  const moveIPC = useIPC<'kanban:moveTask'>()

  // Load tasks on mount
  useEffect(() => {
    store.setIsLoading(true)
    store.clearError()
    listIPC.invoke('kanban:getTasks')
      .then(res => { if (Array.isArray(res)) store.setTasks(res) })
      .catch(err => store.setLastError(String(err)))
      .finally(() => store.setIsLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for real-time task updates
  useIPCEvent('kanban:taskUpdated', useCallback((task: Task) => {
    store.setTasks(prev => {
      const idx = prev.findIndex(t => t.id === task.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = task
        return next
      }
      return [...prev, task]
    })
  }, [store]))

  const reloadTasks = useCallback(async () => {
    const tasks = await listIPC.invoke('kanban:getTasks')
    if (Array.isArray(tasks)) store.setTasks(tasks)
  }, [listIPC, store])

  const createTask = useCallback(async (input: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => {
    store.clearError()
    try {
      const result = await createIPC.invoke('kanban:createTask', input as any)
      if (result && 'id' in result) {
        store.setTasks(prev => [...prev, result as Task])
      }
      return result
    } catch (err) {
      store.setLastError(String(err))
      throw err
    }
  }, [store, createIPC])

  const updateTask = useCallback(async (task: Task) => {
    store.clearError()
    try {
      const result = await updateIPC.invoke('kanban:updateTask', task)
      if (result && 'id' in result) {
        store.setTasks(prev => prev.map(t => t.id === (result as Task).id ? result as Task : t))
      }
      return result
    } catch (err) {
      store.setLastError(String(err))
      throw err
    }
  }, [store, updateIPC])

  const deleteTask = useCallback(async (taskId: string) => {
    store.clearError()
    try {
      await deleteIPC.invoke('kanban:deleteTask', taskId)
      store.setTasks(prev => prev.filter(t => t.id !== taskId))
    } catch (err) {
      store.setLastError(String(err))
      throw err
    }
  }, [store, deleteIPC])

  const moveTask = useCallback(async (taskId: string, column: TaskColumn) => {
    store.clearError()
    try {
      const result = await moveIPC.invoke('kanban:moveTask', { taskId, column })
      if (result && 'id' in result) {
        store.setTasks(prev => prev.map(t => t.id === taskId ? result as Task : t))
      }
      return result
    } catch (err) {
      store.setLastError(String(err))
      throw err
    }
  }, [store, moveIPC])

  const filteredTasks = useMemo(
    () => store.selectedColumn === 'all'
      ? store.tasks
      : store.tasks.filter(t => t.column === store.selectedColumn),
    [store.tasks, store.selectedColumn],
  )

  return {
    ...store,
    filteredTasks,
    isLoadingTasks: listIPC.loading,
    reloadTasks,
    createTask,
    updateTask,
    deleteTask,
    moveTask,
  }
}
