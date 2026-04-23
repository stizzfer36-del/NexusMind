import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useIPC, useIPCEvent } from '../../hooks'
import type { GuardFinding, GuardRun, GuardPolicy, GuardSeverity, SecurityScore, GuardTrendPoint, FixSuggestion } from '@nexusmind/shared'
import styles from './GuardPanel.module.css'

const SEV_ORDER: GuardSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

const SEV_COLORS: Record<GuardSeverity, string> = {
  CRITICAL: '#f97316',
  HIGH: '#ef4444',
  MEDIUM: '#f59e0b',
  LOW: '#818cf8',
}

const GRADE_COLORS: Record<string, string> = {
  'A+': '#22c55e',
  'A': '#22c55e',
  'B': '#f59e0b',
  'C': '#f97316',
  'D': '#ef4444',
  'F': '#dc2626',
}

function fmt(ts: number) {
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const radius = 30
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color = GRADE_COLORS[grade] ?? '#818cf8'

  return (
    <div className={styles.scoreRing}>
      <svg className={styles.scoreRingSvg} viewBox="0 0 72 72">
        <circle className={styles.scoreRingBg} cx="36" cy="36" r={radius} />
        <circle
          className={styles.scoreRingFill}
          cx="36" cy="36" r={radius}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className={styles.scoreGrade}>
        <span className={styles.scoreGradeLetter} style={{ color }}>{grade}</span>
        <span className={styles.scoreGradeLabel}>{score}/100</span>
      </div>
    </div>
  )
}

function TrendChart({ trends }: { trends: GuardTrendPoint[] }) {
  if (trends.length < 2) {
    return (
      <div className={styles.trendChart} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
          {trends.length === 0 ? 'No scan history' : 'Need 2+ scans'}
        </span>
      </div>
    )
  }

  const maxTotal = Math.max(...trends.map(t => t.total), 1)
  const w = 200
  const h = 70
  const padY = 4
  const chartH = h - padY * 2

  const points = trends.map((t, i) => ({
    x: (i / (trends.length - 1)) * w,
    y: padY + chartH - (t.total / maxTotal) * chartH,
    ...t,
  }))

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${h} L ${points[0].x} ${h} Z`

  const criticalPoints = trends.map((t, i) => ({
    x: (i / (trends.length - 1)) * w,
    y: padY + chartH - (t.critical / maxTotal) * chartH,
  }))
  const criticalPath = criticalPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

  return (
    <div className={styles.trendChart}>
      <svg className={styles.trendSvg} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map(ratio => (
          <line key={ratio} className={styles.trendGridLine} x1={0} y1={padY + chartH * ratio} x2={w} y2={padY + chartH * ratio} />
        ))}
        <path className={styles.trendArea} d={areaPath} fill="#7c6af7" />
        <path className={styles.trendLine} d={linePath} stroke="#7c6af7" />
        <path className={styles.trendLine} d={criticalPath} stroke="#f97316" strokeDasharray="3 3" />
      </svg>
    </div>
  )
}

export function GuardPanel() {
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
  const installHookIPC = useIPC<'git:installPreCommitHook'>()
  const isHookInstalledIPC = useIPC<'git:isPreCommitHookInstalled'>()
  const uninstallHookIPC = useIPC<'git:uninstallPreCommitHook'>()
  const setSaveScanIPC = useIPC<'file:setSaveScanEnabled'>()
  const isSaveScanIPC = useIPC<'file:isSaveScanEnabled'>()

  const [runs, setRuns] = useState<GuardRun[]>([])
  const [selectedRun, setSelectedRun] = useState<GuardRun | null>(null)
  const [findings, setFindings] = useState<GuardFinding[]>([])
  const [policy, setPolicy] = useState<GuardPolicy>({ blockOn: ['CRITICAL'] })
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sevFilter, setSevFilter] = useState<GuardSeverity | 'all'>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [scannerStatus, setScannerStatus] = useState<Record<string, string>>({})
  const [securityScore, setSecurityScore] = useState<SecurityScore | null>(null)
  const [trends, setTrends] = useState<GuardTrendPoint[]>([])
  const [fixSuggestion, setFixSuggestion] = useState<FixSuggestion | null>(null)
  const [fixLoading, setFixLoading] = useState<string | null>(null)
  const [hookInstalled, setHookInstalled] = useState(false)
  const [saveScanEnabled, setSaveScanEnabled] = useState(false)
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

  const loadSecurityScore = useCallback(async () => {
    try {
      const score = await getSecurityScoreIPC.invoke('guard:getSecurityScore')
      setSecurityScore(score as SecurityScore)
    } catch {}
  }, [getSecurityScoreIPC])

  const loadTrends = useCallback(async () => {
    try {
      const t = await getTrendsIPC.invoke('guard:getTrends')
      setTrends(t as GuardTrendPoint[])
    } catch {}
  }, [getTrendsIPC])

  useEffect(() => {
    loadRuns()
    getPolicyIPC.invoke('guard:getPolicy').then(setPolicy).catch(() => {})
    loadSecurityScore()
    loadTrends()
    isHookInstalledIPC.invoke('git:isPreCommitHookInstalled').then(v => setHookInstalled(!!v)).catch(() => {})
    isSaveScanIPC.invoke('file:isSaveScanEnabled').then(v => setSaveScanEnabled(!!v)).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useIPCEvent('guard:progress', useCallback((payload: { scanner: string; status: string; findings: GuardFinding[] }) => {
    setScannerStatus(prev => ({ ...prev, [payload.scanner]: payload.status }))
    if (payload.findings.length > 0) {
      setFindings(prev => [...prev, ...payload.findings])
    }
  }, []))

  useIPCEvent('guard:complete', useCallback((payload: { runId: string; findings: GuardFinding[] }) => {
    setRunning(false)
    setFindings(payload.findings)
    loadRuns()
    loadSecurityScore()
    loadTrends()
    getRunIPC.invoke('guard:getRun', payload.runId).then(r => {
      if (r) setSelectedRun(r)
    }).catch(() => {})
  }, [loadRuns, loadSecurityScore, loadTrends, getRunIPC]))

  const selectRun = useCallback(async (run: GuardRun) => {
    setSelectedRun(run)
    setFixSuggestion(null)
    try {
      const f = await getFindingsIPC.invoke('guard:getFindings', run.id)
      setFindings(f)
    } catch (e) { setError(String(e)) }
  }, [getFindingsIPC])

  const handleRunGuard = useCallback(async () => {
    setRunning(true)
    setError(null)
    setScannerStatus({})
    setFixSuggestion(null)
    try {
      const { runId } = await runGuardIPC.invoke('guard:run')
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
          loadSecurityScore()
          loadTrends()
        }
      }, 1500)
    } catch (e) {
      setError(String(e))
      setRunning(false)
    }
  }, [runGuardIPC, getRunIPC, listRunsIPC, getFindingsIPC, loadSecurityScore, loadTrends])

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

  const handleExportSarif = useCallback(async () => {
    try {
      const report = await exportSarifIPC.invoke('guard:exportSarif', selectedRun?.id)
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `nexusguard-sarif-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) { setError(String(e)) }
  }, [exportSarifIPC, selectedRun])

  const handleFixSuggestion = useCallback(async (findingId: string) => {
    setFixLoading(findingId)
    setFixSuggestion(null)
    try {
      const suggestion = await fixSuggestionIPC.invoke('guard:fixSuggestion', findingId)
      setFixSuggestion(suggestion as FixSuggestion | null)
    } catch (e) {
      setError(String(e))
    } finally {
      setFixLoading(null)
    }
  }, [fixSuggestionIPC])

  const handleToggleHook = useCallback(async () => {
    if (hookInstalled) {
      const result = await uninstallHookIPC.invoke('git:uninstallPreCommitHook')
      if (result && (result as any).removed) setHookInstalled(false)
    } else {
      const result = await installHookIPC.invoke('git:installPreCommitHook')
      if (result && (result as any).installed) setHookInstalled(true)
    }
  }, [hookInstalled, installHookIPC, uninstallHookIPC])

  const handleToggleSaveScan = useCallback(async () => {
    const next = !saveScanEnabled
    await setSaveScanIPC.invoke('file:setSaveScanEnabled', next)
    setSaveScanEnabled(next)
  }, [saveScanEnabled, setSaveScanIPC])

  const filtered = useMemo(
    () => findings.filter(f =>
      (sevFilter === 'all' || f.severity === sevFilter) &&
      (sourceFilter === 'all' || f.source === sourceFilter)
    ),
    [findings, sevFilter, sourceFilter],
  )

  const summary = selectedRun?.summary
  const isBlocking = policy.blockOn.includes('CRITICAL') && (summary?.bySeverity.CRITICAL ?? 0) > 0

  const trendLabel = securityScore?.trend === 'improving' ? '↑ Improving' : securityScore?.trend === 'declining' ? '↓ Declining' : '→ Stable'
  const trendClass = securityScore?.trend === 'improving' ? styles.trendImproving : securityScore?.trend === 'declining' ? styles.trendDeclining : styles.trendStable

  return (
    <div className={styles.root}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <button className={styles.runBtn} onClick={handleRunGuard} disabled={running}>
          {running && <span className={styles.spinner} />}
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
            {summary.totalFindings === 0 && <span style={{ fontSize: 12, color: 'var(--color-green)' }}>✓ No findings</span>}
          </div>
        )}
        {policy.blockOn.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
            Blocking: {policy.blockOn.join(', ')}
          </span>
        )}
      </div>

      {/* Security Score Hero */}
      {securityScore && (
        <div className={styles.scoreHero}>
          <ScoreRing score={securityScore.score} grade={securityScore.grade} />
          <div className={styles.scoreDetails}>
            <div className={styles.scoreTitle}>Security Score</div>
            <div className={`${styles.scoreTrend} ${trendClass}`}>
              {trendLabel}
            </div>
            <div className={styles.scoreBreakdown}>
              {securityScore.criticalCount > 0 && (
                <div className={styles.scoreBreakdownItem}>
                  <span className={`${styles.scoreBreakdownDot} ${styles.dotCritical}`} />
                  {securityScore.criticalCount} critical
                </div>
              )}
              {securityScore.highCount > 0 && (
                <div className={styles.scoreBreakdownItem}>
                  <span className={`${styles.scoreBreakdownDot} ${styles.dotHigh}`} />
                  {securityScore.highCount} high
                </div>
              )}
              {securityScore.mediumCount > 0 && (
                <div className={styles.scoreBreakdownItem}>
                  <span className={`${styles.scoreBreakdownDot} ${styles.dotMedium}`} />
                  {securityScore.mediumCount} medium
                </div>
              )}
              {securityScore.lowCount > 0 && (
                <div className={styles.scoreBreakdownItem}>
                  <span className={`${styles.scoreBreakdownDot} ${styles.dotLow}`} />
                  {securityScore.lowCount} low
                </div>
              )}
              {securityScore.totalFindings === 0 && (
                <span style={{ fontSize: 11, color: '#22c55e' }}>All clear</span>
              )}
            </div>
          </div>
        </div>
      )}

      {isBlocking && summary && (
        <div className={styles.blockingBanner}>
          ⚠ {summary!.bySeverity.CRITICAL} Critical finding{summary!.bySeverity.CRITICAL !== 1 ? 's' : ''} detected. Review before shipping.
        </div>
      )}

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
            <div className={styles.emptyRuns}>
              <div className={styles.emptyRunsIcon}>🛡</div>
              <div className={styles.emptyRunsTitle}>No scans yet</div>
              <div className={styles.emptyRunsText}>Click Run Guard to scan your project</div>
            </div>
          ) : runs.map(run => (
            <button
              key={run.id}
              className={`${styles.runItem} ${selectedRun?.id === run.id ? styles.runItemActive : ''}`}
              onClick={() => selectRun(run)}
              aria-pressed={selectedRun?.id === run.id}
              aria-label={`Run ${fmt(run.startedAt)}, ${run.status}, ${run.summary.totalFindings} findings`}
            >
              <span className={`${styles.runItemStatus} ${styles[`status${run.status.charAt(0) + run.status.slice(1).toLowerCase()}` as keyof typeof styles]}`}>
                {run.status}
              </span>
              <span className={styles.runItemTime}>{fmt(run.startedAt)}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{run.summary.totalFindings} findings</span>
            </button>
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
            <span className={styles.filterSep} />
            {(['all', 'semgrep', 'npm-audit', 'trufflehog'] as const).map(s => (
              <button key={s} className={`${styles.filterBtn} ${sourceFilter === s ? styles.filterBtnActive : ''}`} onClick={() => setSourceFilter(s)}>
                {s === 'all' ? 'All sources' : s}
              </button>
            ))}
            <button className={styles.exportBtn} onClick={handleExportSarif} title="Export SARIF report">
              ⬇ SARIF
            </button>
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
                  <button
                    className={`${styles.findingRow} ${isExp ? styles.findingRowExpanded : ''}`}
                    onClick={() => setExpandedId(isExp ? null : f.id)}
                    aria-expanded={isExp}
                    aria-label={`${f.severity} finding: ${f.message}${f.line ? ` at line ${f.line}` : ''}`}
                  >
                    <span className={`${styles.sevBadge} ${styles[`sev${f.severity}`]}`}>{f.severity}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{f.source}</span>
                    <span style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text)' }}>{f.message}</span>
                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'right' }}>{f.line ? `L${f.line}` : ''}</span>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filePath.split('/').pop()}</span>
                    <button
                      className={styles.fixBtn}
                      onClick={(e) => { e.stopPropagation(); handleFixSuggestion(f.id) }}
                      disabled={fixLoading !== null}
                      title="Get AI fix suggestion"
                    >
                      ✦ Fix
                    </button>
                  </button>
                  {isExp && (
                    <div className={styles.findingDetail}>
                      <div className={styles.findingMsg}>{f.message}</div>
                      <div className={styles.findingLocation}>{f.filePath}{f.line ? `:${f.line}` : ''}{f.column ? `:${f.column}` : ''}</div>
                      {f.snippet && <pre className={styles.findingSnippet}>{f.snippet}</pre>}
                      {f.recommendation && <div className={styles.findingRec}>→ {f.recommendation}</div>}
                      {fixSuggestion && fixSuggestion.findingId === f.id && (
                        <div className={styles.fixPanel}>
                          <div className={styles.fixPanelHeader}>
                            <span className={styles.fixPanelTitle}>AI Suggestion</span>
                            <span className={`${styles.fixConfidence} ${fixSuggestion.confidence === 'high' ? styles.confidenceHigh : fixSuggestion.confidence === 'medium' ? styles.confidenceMedium : styles.confidenceLow}`}>
                              {fixSuggestion.confidence} confidence
                            </span>
                          </div>
                          <div className={styles.fixExplanation}>{fixSuggestion.explanation}</div>
                          {fixSuggestion.suggestedFix && (
                            <pre className={styles.fixCode}>{fixSuggestion.suggestedFix}</pre>
                          )}
                        </div>
                      )}
                      {fixLoading === f.id && (
                        <div style={{ fontSize: 11, color: 'var(--color-accent)', marginTop: 4 }}>
                          <span className={styles.spinner} style={{ width: 10, height: 10, borderWidth: 1.5, display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} />
                          Generating fix…
                        </div>
                      )}
                    </div>
                  )}
                </React.Fragment>
              )
            })}
          </div>
        </div>

        {/* Right panel */}
        <div className={styles.rightPanel}>
          {/* Security Score */}
          <div className={styles.rightSection}>
            <div className={styles.rightHeader}>Trend</div>
            <TrendChart trends={trends} />
            <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 9, color: 'var(--color-text-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ width: 8, height: 2, background: '#7c6af7', borderRadius: 1, display: 'inline-block' }} /> Total
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ width: 8, height: 2, background: '#f97316', borderRadius: 1, display: 'inline-block', borderTop: '1px dashed #f97316' }} /> Critical
              </span>
            </div>
          </div>

          {/* Policy */}
          <div className={styles.rightSection}>
            <div className={styles.rightHeader}>Policy</div>
            <div style={{ marginBottom: 8, fontSize: 11, color: 'var(--color-text-muted)' }}>Block ship on:</div>
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
          </div>

          {/* Pre-commit Hook */}
          <div className={styles.rightSection}>
            <div className={styles.rightHeader}>Integrations</div>
            <div className={styles.toggleRow}>
              <div>
                <div className={styles.toggleLabel}>Pre-commit Hook</div>
                <div className={styles.toggleDesc}>Block commits with secrets</div>
              </div>
              <button
                className={`${styles.toggleSwitch} ${hookInstalled ? styles.toggleSwitchActive : ''}`}
                onClick={handleToggleHook}
                role="switch"
                aria-checked={hookInstalled}
                aria-label="Toggle pre-commit hook"
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>
            <div className={styles.toggleRow}>
              <div>
                <div className={styles.toggleLabel}>Scan on Save</div>
                <div className={styles.toggleDesc}>Auto-scan files on save</div>
              </div>
              <button
                className={`${styles.toggleSwitch} ${saveScanEnabled ? styles.toggleSwitchActive : ''}`}
                onClick={handleToggleSaveScan}
                role="switch"
                aria-checked={saveScanEnabled}
                aria-label="Toggle scan on save"
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>
          </div>

          {/* Scanners */}
          <div className={styles.rightSection}>
            <div className={styles.rightHeader}>Scanners</div>
            {(['semgrep', 'npm-audit', 'trufflehog'] as const).map(src => {
              const status = scannerStatus[src]
              const count = findings.filter(f => f.source === src).length
              const installed = status !== 'not-installed'
              return (
                <div key={src} className={styles.scannerRow}>
                  <span>{src}</span>
                  {status ? (
                    <span className={installed ? styles.scannerInstalled : styles.scannerMissing}>
                      {installed ? `${count} findings` : 'not installed'}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                  )}
                </div>
              )
            })}
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 6, lineHeight: 1.4 }}>
              Install missing scanners:<br />
              • semgrep: pip install semgrep<br />
              • npm: included with Node.js<br />
              • trufflehog: brew install trufflehog
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}