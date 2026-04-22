import { useCallback, useEffect, useMemo } from 'react'
import { useIPC } from '../../hooks'
import { useBenchStore } from '../../stores/bench.store'
import type { BenchDimension, BenchRunConfig } from '@nexusmind/shared'
import { ModelProvider } from '@nexusmind/shared'

export function useBench() {
  const store = useBenchStore()
  const tasksIPC = useIPC<'bench:listTasks'>()
  const runsIPC = useIPC<'bench:listRuns'>()
  const runTaskIPC = useIPC<'bench:runTask'>()
  const runBatchIPC = useIPC<'bench:runBatch'>()
  const modelsIPC = useIPC<'bench:listModels'>()

  // Load tasks on mount
  useEffect(() => {
    const dim = store.selectedDimension === 'all' ? undefined : store.selectedDimension as BenchDimension
    tasksIPC.invoke('bench:listTasks', dim)
      .then(store.setTasks)
      .catch(err => store.setLastError(String(err)))
  }, [store.selectedDimension]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load runs on mount
  useEffect(() => {
    runsIPC.invoke('bench:listRuns')
      .then(store.setRuns)
      .catch(err => store.setLastError(String(err)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const reloadRuns = useCallback(async () => {
    const runs = await runsIPC.invoke('bench:listRuns')
    store.setRuns(runs)
  }, [runsIPC, store])

  const runSingle = useCallback(async (taskId: string) => {
    if (!store.selectedModelId || !store.selectedProvider) {
      store.setLastError('Select a model before running')
      return
    }
    store.setIsRunning(true)
    store.clearError()
    try {
      const config: BenchRunConfig = {
        modelId: store.selectedModelId,
        provider: store.selectedProvider as ModelProvider,
        maxTokens: 512,
      }
      await runTaskIPC.invoke('bench:runTask', taskId, config)
      await reloadRuns()
    } catch (err) {
      store.setLastError(String(err))
    } finally {
      store.setIsRunning(false)
    }
  }, [store, runTaskIPC, reloadRuns])

  const runBatch = useCallback(async (taskIds: string[]) => {
    if (!store.selectedModelId || !store.selectedProvider) {
      store.setLastError('Select a model before running')
      return
    }
    store.setIsRunning(true)
    store.clearError()
    try {
      const config: BenchRunConfig = {
        modelId: store.selectedModelId,
        provider: store.selectedProvider as ModelProvider,
        maxTokens: 512,
      }
      await runBatchIPC.invoke('bench:runBatch', taskIds, config)
      await reloadRuns()
    } catch (err) {
      store.setLastError(String(err))
    } finally {
      store.setIsRunning(false)
    }
  }, [store, runBatchIPC, reloadRuns])

  const filteredTasks = useMemo(
    () => store.selectedDimension === 'all'
      ? store.tasks
      : store.tasks.filter(t => t.dimension === store.selectedDimension),
    [store.tasks, store.selectedDimension],
  )

  const filteredRuns = useMemo(
    () => store.selectedDimension === 'all'
      ? store.runs
      : store.runs.filter(r => r.dimension === store.selectedDimension),
    [store.runs, store.selectedDimension],
  )

  return {
    ...store,
    filteredTasks,
    filteredRuns,
    isLoadingTasks: tasksIPC.loading,
    isLoadingRuns: runsIPC.loading,
    runSingle,
    runBatch,
  }
}
