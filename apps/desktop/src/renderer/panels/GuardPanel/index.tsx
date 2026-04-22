import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useIPC } from '../../hooks'
import type { GuardFinding, GuardRun, GuardPolicy, GuardSeverity } from '@nexusmind/shared'
import styles from './GuardPanel.module.css'

const SEV_ORDER: GuardSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

function fmt(ts: number) {
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function GuardPanel() {
  const listRunsIPC = useIPC<'guard:listRuns'>()
  const runGuardIPC = useIPC<'guard:run'>()
  const getRunIPC = useIPC<'guard:getRun'>()
  const getFindingsIPC = useIPC<'guard:getFindings'>()
  const getPolicyIPC = useIPC<'guard:getPolicy'>()
  const setPolicyIPC = useIPC<'guard:setPolicy'>()

  const [runs, setRuns] = useState<GuardRun[]>([])
  const [selectedRun, setSelectedRun] = useState<GuardRun | null>(null)
  const [findings, setFindings] = useState<GuardFinding[]>([])
  const [policy, setPolicy] = useState<GuardPolicy>({ blockOn: ['CRITICAL'] })
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sevFilter, setSevFilter] = useState<GuardSeverity | 'all'>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadRuns = useCallback(async () => {
    try {
      const r = await listRunsIPC.invoke('guard:listRuns')
      setRuns(r)
      if (r.length > 0 && !selectedRun) {
        const first = r[0]
        setSelectedRun(first)
        const f = await getFindingsIPC.invoke('guard:getFindings', first.id)
        setFindings(f)
      }
    } catch (e) { setError(String(e)) }
  }, [listRunsIPC, getFindingsIPC, selectedRun])

  useEffect(() => {
    loadRuns()
    getPolicyIPC.invoke('guard:getPolicy').then(setPolicy).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const selectRun = useCallback(async (run: GuardRun) => {
    setSelectedRun(run)
    try {
      const f = await getFindingsIPC.invoke('guard:getFindings', run.id)
      setFindings(f)
    } catch (e) { setError(String(e)) }
  }, [getFindingsIPC])

  const handleRunGuard = useCallback(async () => {
    setRunning(true)
    setError(null)
    try {
      const { runId } = await runGuardIPC.invoke('guard:run')
      // Poll until completed
      pollRef.current = setInterval(async () => {
        const r = await getRunIPC.invoke('guard:getRun', runId)
        if (r && (r.status === 'COMPLETED' || r.status === 'FAILED')) {
          clearInterval(pollRef.current!)
          setRunning(false)
          const allRuns = await listRunsIPC.invoke('guard:listRuns')
          setRuns(allRuns)
          setSelectedRun(r)
          const f = await getFindingsIPC.invoke('guard:getFindings', runId)
          setFindings(f)
        }
      }, 1500)
    } catch (e) {
      setError(String(e))
      setRunning(false)
    }
  }, [runGuardIPC, getRunIPC, listRunsIPC, getFindingsIPC])

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const handlePolicyToggle = useCallback(async (sev: GuardSeverity) => {
    const next: GuardPolicy = {
      blockOn: policy.blockOn.includes(sev)
        ? policy.blockOn.filter(s => s !== sev)
        : [...policy.blockOn, sev],
    }
    setPolicy(next)
    try { await setPolicyIPC.invoke('guard:setPolicy', next) } catch {}
  }, [policy, setPolicyIPC])

  const filtered = findings.filter(f =>
    (sevFilter === 'all' || f.severity === sevFilter) &&
    (sourceFilter === 'all' || f.source === sourceFilter)
  )

  const summary = selectedRun?.summary

  return (
    <div className={styles.root}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <button className={styles.runBtn} onClick={handleRunGuard} disabled={running}>
          {running ? 'Scanning…' : 'Run Guard'}
        </button>
        {summary && (
          <div className={styles.summaryChips}>
            {SEV_ORDER.map(s => (
              summary.bySeverity[s] > 0 && (
                <span key={s} className={`${styles.chip} ${styles[`chip${s.charAt(0) + s.slice(1).toLowerCase()}` as keyof typeof styles]}`}>
                  {summary.bySeverity[s]} {s}
                </span>
              )
            ))}
            {summary.totalFindings === 0 && <span style={{ fontSize: 12, color: '#22c55e' }}>✓ No findings</span>}
          </div>
        )}
        {policy.blockOn.length > 0 && (
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 'auto' }}>
            Blocking: {policy.blockOn.join(', ')}
          </span>
        )}
      </div>

      {error && (
        <div className={styles.errorBar}>
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className={styles.body}>
        {/* Run history sidebar */}
        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>Runs</div>
          {runs.length === 0 ? (
            <div className={styles.empty} style={{ padding: '16px 12px', fontSize: 12 }}>No runs yet</div>
          ) : runs.map(run => (
            <div
              key={run.id}
              className={`${styles.runItem} ${selectedRun?.id === run.id ? styles.runItemActive : ''}`}
              onClick={() => selectRun(run)}
            >
              <span className={`${styles.runItemStatus} ${styles[`status${run.status.charAt(0) + run.status.slice(1).toLowerCase()}` as keyof typeof styles]}`}>
                {run.status}
              </span>
              <span className={styles.runItemTime}>{fmt(run.startedAt)}</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{run.summary.totalFindings} findings</span>
            </div>
          ))}
        </div>

        {/* Main findings area */}
        <div className={styles.main}>
          <div className={styles.filters}>
            {(['all', ...SEV_ORDER] as Array<GuardSeverity | 'all'>).map(s => (
              <button key={s} className={`${styles.filterBtn} ${sevFilter === s ? styles.filterBtnActive : ''}`} onClick={() => setSevFilter(s)}>
                {s === 'all' ? 'All' : s}
              </button>
            ))}
            <span style={{ width: 1, background: 'rgba(255,255,255,0.1)', margin: '0 4px', alignSelf: 'stretch' }} />
            {(['all', 'semgrep', 'npm-audit', 'trufflehog'] as const).map(s => (
              <button key={s} className={`${styles.filterBtn} ${sourceFilter === s ? styles.filterBtnActive : ''}`} onClick={() => setSourceFilter(s)}>
                {s === 'all' ? 'All sources' : s}
              </button>
            ))}
          </div>

          <div className={styles.findingsTable}>
            {!selectedRun ? (
              <div className={styles.empty}>Run Guard to scan your project</div>
            ) : filtered.length === 0 ? (
              <div className={styles.empty}>No findings match the current filter</div>
            ) : filtered.map(f => {
              const isExp = expandedId === f.id
              return (
                <React.Fragment key={f.id}>
                  <div
                    className={`${styles.findingRow} ${isExp ? styles.findingRowExpanded : ''}`}
                    onClick={() => setExpandedId(isExp ? null : f.id)}
                  >
                    <span className={`${styles.sevBadge} ${styles[`sev${f.severity}`]}`}>{f.severity}</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{f.source}</span>
                    <span style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.message}</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textAlign: 'right' }}>{f.line ? `L${f.line}` : ''}</span>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filePath.split('/').pop()}</span>
                  </div>
                  {isExp && (
                    <div className={styles.findingDetail}>
                      <div className={styles.findingMsg}>{f.message}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{f.filePath}{f.line ? `:${f.line}` : ''}</div>
                      {f.snippet && <pre className={styles.findingSnippet}>{f.snippet}</pre>}
                      {f.recommendation && <div className={styles.findingRec}>→ {f.recommendation}</div>}
                    </div>
                  )}
                </React.Fragment>
              )
            })}
          </div>
        </div>

        {/* Right policy panel */}
        <div className={styles.rightPanel}>
          <div className={styles.rightHeader}>Policy</div>
          <div style={{ marginBottom: 12, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Block ship on:</div>
          {SEV_ORDER.map(s => (
            <div key={s} className={styles.policyRow}>
              <input
                type="checkbox"
                className={styles.policyCheck}
                checked={policy.blockOn.includes(s)}
                onChange={() => handlePolicyToggle(s)}
              />
              <span>{s}</span>
            </div>
          ))}
          <div style={{ marginTop: 16 }}>
            <div className={styles.rightHeader}>Scanners</div>
            {(['semgrep', 'npm-audit', 'trufflehog'] as const).map(src => {
              const count = findings.filter(f => f.source === src).length
              return (
                <div key={src} style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
                  {src}: {selectedRun ? `${count} findings` : '—'}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
