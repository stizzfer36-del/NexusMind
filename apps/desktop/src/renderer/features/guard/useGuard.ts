import { useCallback } from 'react'
import { useIPC } from '../../hooks'
import { useGuardStore } from '../../stores/guard.store'
import type { GuardPolicy } from '@nexusmind/shared'

export function useGuard() {
  const store = useGuardStore()
  const listRunsIPC = useIPC<'guard:listRuns'>()
  const runGuardIPC = useIPC<'guard:run'>()
  const getRunIPC = useIPC<'guard:getRun'>()
  const getFindingsIPC = useIPC<'guard:getFindings'>()
  const getPolicyIPC = useIPC<'guard:getPolicy'>()
  const setPolicyIPC = useIPC<'guard:setPolicy'>()

  const loadRuns = useCallback(async () => {
    store.setLoading(true)
    try {
      const runs = await listRunsIPC.invoke('guard:listRuns')
      store.setRuns(runs)
    } catch (e) {
      store.setError(String(e))
    } finally {
      store.setLoading(false)
    }
  }, [store, listRunsIPC])

  const selectRun = useCallback(async (runId: string) => {
    store.setSelectedRunId(runId)
    try {
      const findings = await getFindingsIPC.invoke('guard:getFindings', runId)
      store.setFindings(findings)
    } catch (e) {
      store.setError(String(e))
    }
  }, [store, getFindingsIPC])

  const runGuard = useCallback(async () => {
    store.setRunning(true)
    store.clearError()
    try {
      const { runId } = await runGuardIPC.invoke('guard:run')
      const poll = setInterval(async () => {
        const run = await getRunIPC.invoke('guard:getRun', runId)
        if (run && (run.status === 'COMPLETED' || run.status === 'FAILED')) {
          clearInterval(poll)
          store.setRunning(false)
          const runs = await listRunsIPC.invoke('guard:listRuns')
          store.setRuns(runs)
          store.setSelectedRunId(runId)
          const findings = await getFindingsIPC.invoke('guard:getFindings', runId)
          store.setFindings(findings)
        }
      }, 1500)
    } catch (e) {
      store.setError(String(e))
      store.setRunning(false)
    }
  }, [store, runGuardIPC, getRunIPC, listRunsIPC, getFindingsIPC])

  const loadPolicy = useCallback(async () => {
    try {
      const policy = await getPolicyIPC.invoke('guard:getPolicy')
      store.setPolicy(policy)
    } catch {}
  }, [store, getPolicyIPC])

  const updatePolicy = useCallback(async (policy: GuardPolicy) => {
    store.setPolicy(policy)
    try {
      await setPolicyIPC.invoke('guard:setPolicy', policy)
    } catch {}
  }, [store, setPolicyIPC])

  return {
    ...store,
    loadRuns,
    selectRun,
    runGuard,
    loadPolicy,
    updatePolicy,
  }
}
