import { useCallback } from 'react'
import { useIPC, useIPCEvent } from '../../hooks'
import { useGuardStore } from '../../stores/guard.store'
import type { GuardPolicy, GuardFinding, SecurityScore, GuardTrendPoint, FixSuggestion } from '@nexusmind/shared'

export function useGuard() {
  const store = useGuardStore()
  const listRunsIPC = useIPC<'guard:listRuns'>()
  const runGuardIPC = useIPC<'guard:run'>()
  const getRunIPC = useIPC<'guard:getRun'>()
  const getFindingsIPC = useIPC<'guard:getFindings'>()
  const getPolicyIPC = useIPC<'guard:getPolicy'>()
  const setPolicyIPC = useIPC<'guard:setPolicy'>()
  const getSecurityScoreIPC = useIPC<'guard:getSecurityScore'>()
  const getTrendsIPC = useIPC<'guard:getTrends'>()
  const exportSarifIPC = useIPC<'guard:exportSarif'>()
  const fixSuggestionIPC = useIPC<'guard:fixSuggestion'>()
  const scanFileIPC = useIPC<'guard:scanFile'>()
  const preCommitCheckIPC = useIPC<'guard:preCommitCheck'>()
  const installHookIPC = useIPC<'git:installPreCommitHook'>()
  const uninstallHookIPC = useIPC<'git:uninstallPreCommitHook'>()
  const isHookInstalledIPC = useIPC<'git:isPreCommitHookInstalled'>()
  const setSaveScanIPC = useIPC<'file:setSaveScanEnabled'>()
  const isSaveScanIPC = useIPC<'file:isSaveScanEnabled'>()

  const loadRuns = useCallback(async () => {
    store.setLoading(true)
    try {
      const runs = await listRunsIPC.invoke('guard:listRuns')
      if (Array.isArray(runs)) store.setRuns(runs)
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
      if (Array.isArray(findings)) store.setFindings(findings)
    } catch (e) {
      store.setError(String(e))
    }
  }, [store, getFindingsIPC])

  const runGuard = useCallback(async () => {
    store.setRunning(true)
    store.clearError()
    try {
      const res = await runGuardIPC.invoke('guard:run')
      if (!res || !('runId' in res) || !(res as any).runId) {
        store.setError('Guard service unavailable')
        store.setRunning(false)
        return
      }
      const { runId } = res as { runId: string }
      const poll = setInterval(async () => {
        const run = await getRunIPC.invoke('guard:getRun', runId)
        if (run && (run.status === 'COMPLETED' || run.status === 'FAILED')) {
          clearInterval(poll)
          store.setRunning(false)
          const runs = await listRunsIPC.invoke('guard:listRuns')
          if (Array.isArray(runs)) store.setRuns(runs)
          store.setSelectedRunId(runId)
          const findings = await getFindingsIPC.invoke('guard:getFindings', runId)
          if (Array.isArray(findings)) store.setFindings(findings)
          loadSecurityScore()
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

  const loadSecurityScore = useCallback(async () => {
    try {
      const score = await getSecurityScoreIPC.invoke('guard:getSecurityScore')
      store.setSecurityScore(score as SecurityScore)
    } catch {}
  }, [store, getSecurityScoreIPC])

  const loadTrends = useCallback(async () => {
    try {
      const trends = await getTrendsIPC.invoke('guard:getTrends')
      store.setTrends(trends as GuardTrendPoint[])
    } catch {}
  }, [store, getTrendsIPC])

  const exportSarif = useCallback(async (runId?: string) => {
    try {
      const report = await exportSarifIPC.invoke('guard:exportSarif', runId)
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `nexusguard-sarif-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      store.setError(String(e))
    }
  }, [store, exportSarifIPC])

  const getFixSuggestion = useCallback(async (findingId: string) => {
    store.setFixLoading(true)
    store.setFixSuggestion(null)
    try {
      const suggestion = await fixSuggestionIPC.invoke('guard:fixSuggestion', findingId)
      store.setFixSuggestion(suggestion as FixSuggestion | null)
    } catch (e) {
      store.setError(String(e))
    } finally {
      store.setFixLoading(false)
    }
  }, [store, fixSuggestionIPC])

  const scanFile = useCallback(async (filePath: string) => {
    try {
      const findings = await scanFileIPC.invoke('guard:scanFile', filePath)
      return findings as GuardFinding[]
    } catch {
      return []
    }
  }, [scanFileIPC])

  const preCommitCheck = useCallback(async () => {
    try {
      const result = await preCommitCheckIPC.invoke('guard:preCommitCheck')
      return result
    } catch (e) {
      store.setError(String(e))
      return null
    }
  }, [store, preCommitCheckIPC])

  const installPreCommitHook = useCallback(async () => {
    try {
      const result = await installHookIPC.invoke('git:installPreCommitHook')
      if (result && (result as any).installed) {
        store.setHookInstalled(true)
      }
      return result
    } catch (e) {
      store.setError(String(e))
      return null
    }
  }, [store, installHookIPC])

  const uninstallPreCommitHook = useCallback(async () => {
    try {
      const result = await uninstallHookIPC.invoke('git:uninstallPreCommitHook')
      if (result && (result as any).removed) {
        store.setHookInstalled(false)
      }
      return result
    } catch (e) {
      store.setError(String(e))
      return null
    }
  }, [store, uninstallHookIPC])

  const checkHookInstalled = useCallback(async () => {
    try {
      const installed = await isHookInstalledIPC.invoke('git:isPreCommitHookInstalled')
      store.setHookInstalled(!!installed)
    } catch {}
  }, [store, isHookInstalledIPC])

  const setSaveScanEnabled = useCallback(async (enabled: boolean) => {
    try {
      await setSaveScanIPC.invoke('file:setSaveScanEnabled', enabled)
      store.setSaveScanEnabled(enabled)
    } catch {}
  }, [store, setSaveScanIPC])

  const checkSaveScanEnabled = useCallback(async () => {
    try {
      const enabled = await isSaveScanIPC.invoke('file:isSaveScanEnabled')
      store.setSaveScanEnabled(!!enabled)
    } catch {}
  }, [store, isSaveScanIPC])

  useIPCEvent('guard:progress', useCallback((payload: { scanner: string; status: string; findings: GuardFinding[] }) => {
    if (payload.findings.length > 0) {
      store.setFindings(prev => [...prev, ...payload.findings])
    }
  }, []))

  useIPCEvent('guard:complete', useCallback((payload: { runId: string; findings: GuardFinding[] }) => {
    store.setRunning(false)
    store.setFindings(payload.findings)
    loadRuns()
    loadSecurityScore()
    getRunIPC.invoke('guard:getRun', payload.runId).then(r => {
      if (r) store.setSelectedRunId(payload.runId)
    }).catch(() => {})
  }, [loadRuns, loadSecurityScore, getRunIPC]))

  useIPCEvent('guard:fileScanResult', useCallback((payload: { filePath: string; findings: GuardFinding[] }) => {
    if (payload.findings.length > 0) {
      store.setFindings(prev => [...prev, ...payload.findings])
    }
  }, []))

  return {
    ...store,
    loadRuns,
    selectRun,
    runGuard,
    loadPolicy,
    updatePolicy,
    loadSecurityScore,
    loadTrends,
    exportSarif,
    getFixSuggestion,
    scanFile,
    preCommitCheck,
    installPreCommitHook,
    uninstallPreCommitHook,
    checkHookInstalled,
    setSaveScanEnabled,
    checkSaveScanEnabled,
  }
}