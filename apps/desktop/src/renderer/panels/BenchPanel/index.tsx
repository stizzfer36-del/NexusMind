import React, { useCallback, useState } from 'react'
import { useBench } from '../../features/bench/useBench'
import type { BenchDimension, BenchRunResult } from '@nexusmind/shared'
import styles from './BenchPanel.module.css'

const DIMENSIONS: Array<{ key: 'all' | BenchDimension; label: string }> = [
  { key: 'all',           label: 'All' },
  { key: 'quality',       label: 'Quality' },
  { key: 'speed',         label: 'Speed' },
  { key: 'cost',          label: 'Cost' },
  { key: 'hallucination', label: 'Hallucination' },
  { key: 'complexity',    label: 'Complexity' },
  { key: 'reasoning',     label: 'Reasoning' },
]

const DIM_COLORS: Record<string, string> = {
  quality:       'var(--color-green, #22c55e)',
  speed:         'var(--color-blue, #3b82f6)',
  cost:          'var(--color-yellow, #f59e0b)',
  hallucination: '#f97316',
  complexity:    'var(--color-accent, #7c6af7)',
  reasoning:     '#ec4899',
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = score >= 0.8 ? 'var(--color-green, #22c55e)' : score >= 0.5 ? 'var(--color-yellow, #f59e0b)' : '#f97316'
  return (
    <div className={styles.scoreBar}>
      <div className={styles.scoreFill} style={{ width: `${pct}%`, background: color }} />
      <span className={styles.scoreLabel}>{pct}%</span>
    </div>
  )
}

export function BenchPanel() {
  const bench = useBench()
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  const [modelInput, setModelInput] = useState('')
  const [providerInput, setProviderInput] = useState('anthropic')

  const handleSetModel = useCallback(() => {
    if (modelInput.trim()) {
      bench.setSelectedModel(modelInput.trim(), providerInput.trim())
    }
  }, [bench.setSelectedModel, modelInput, providerInput])

  const handleRunAll = useCallback(() => {
    const ids = bench.filteredTasks.map(t => t.id)
    if (ids.length > 0) bench.runBatch(ids)
  }, [bench.filteredTasks, bench.runBatch])

  const runsForTask = (taskId: string): BenchRunResult[] =>
    bench.filteredRuns.filter(r => r.taskId === taskId).slice(0, 3)

  return (
    <div className={styles.root}>
      {/* Left: dimension filter + task list */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>Dimensions</div>
        <div className={styles.dimFilters}>
          {DIMENSIONS.map(d => (
            <button
              key={d.key}
              className={`${styles.dimChip} ${bench.selectedDimension === d.key ? styles.dimChipActive : ''}`}
              style={bench.selectedDimension === d.key && d.key !== 'all'
                ? { borderColor: DIM_COLORS[d.key], color: DIM_COLORS[d.key] }
                : {}
              }
              onClick={() => bench.setSelectedDimension(d.key)}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className={styles.sidebarSection}>Tasks</div>
        <div className={styles.taskList}>
          {bench.isLoadingTasks ? (
            <div className={styles.skeletonList}>
              <div className={styles.skeletonRow} />
              <div className={styles.skeletonRow} />
              <div className={styles.skeletonRow} />
            </div>
          ) : bench.lastError ? (
            <div className={styles.errorState}>
              <span className={styles.errorLabel}>Service unavailable</span>
              <span className={styles.errorDetail}>{bench.lastError}</span>
            </div>
          ) : bench.filteredTasks.length === 0 ? (
            <div className={styles.empty}>No tasks</div>
          ) : (
            bench.filteredTasks.map(task => {
              const lastRun = runsForTask(task.id)[0]
              return (
                <div key={task.id} className={styles.taskRow}>
                  <div className={styles.taskInfo}>
                    <span
                      className={styles.taskDim}
                      style={{ color: DIM_COLORS[task.dimension] }}
                    >
                      {task.dimension}
                    </span>
                    <span className={styles.taskName}>{task.name}</span>
                  </div>
                  <div className={styles.taskActions}>
                    {lastRun && <ScoreBar score={lastRun.successScore} />}
                    <button
                      className={styles.runBtn}
                      onClick={() => bench.runSingle(task.id)}
                      disabled={bench.isRunning || !bench.selectedModelId}
                      title="Run this task"
                    >
                      ▶
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Right: controls + results */}
      <div className={styles.detail}>
        {/* Model selector */}
        <div className={styles.modelBar}>
          <input
            className={styles.modelInput}
            placeholder="Model ID (e.g. claude-sonnet-4-6)"
            value={modelInput}
            onChange={e => setModelInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSetModel()}
          />
          <select
            className={styles.providerSelect}
            value={providerInput}
            onChange={e => setProviderInput(e.target.value)}
          >
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
            <option value="openrouter">OpenRouter</option>
            <option value="google">Google</option>
            <option value="local">Local</option>
          </select>
          <button className={styles.setModelBtn} onClick={handleSetModel}>
            Set Model
          </button>
          {bench.selectedModelId && (
            <span className={styles.activeModel}>
              {bench.selectedProvider}/{bench.selectedModelId}
            </span>
          )}
          <button
            className={styles.runAllBtn}
            onClick={handleRunAll}
            disabled={bench.isRunning || !bench.selectedModelId || bench.filteredTasks.length === 0}
          >
            {bench.isRunning ? 'Running…' : `Run All (${bench.filteredTasks.length})`}
          </button>
        </div>

        {bench.lastError && (
          <div className={styles.errorBar}>
            {bench.lastError}
            <button onClick={bench.clearError}>×</button>
          </div>
        )}

        {/* Results table */}
        <div className={styles.resultsHeader}>Results</div>
        <div className={styles.resultsTable}>
          {bench.filteredRuns.length === 0 ? (
            <div className={styles.emptyRuns}>
              No runs yet — select a model and run tasks
            </div>
          ) : (
            bench.filteredRuns.map(run => {
              const isExpanded = expandedRunId === run.id
              return (
                <div
                  key={run.id}
                  className={`${styles.runRow} ${isExpanded ? styles.runRowExpanded : ''}`}
                  onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                >
                  <div className={styles.runRowMain}>
                    <span
                      className={styles.runDim}
                      style={{ color: DIM_COLORS[run.dimension] }}
                    >
                      {run.dimension}
                    </span>
                    <span className={styles.runModel}>{run.modelId}</span>
                    <span className={styles.runDuration}>{run.durationMs}ms</span>
                    <ScoreBar score={run.successScore} />
                    <span className={styles.runDate}>
                      {new Date(run.startedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  {isExpanded && (
                    <div className={styles.runDetail}>
                      {run.promptTokens != null && (
                        <div className={styles.runMeta}>
                          Tokens: {run.promptTokens} in / {run.completionTokens} out
                        </div>
                      )}
                      <pre className={styles.runPreview}>{run.rawResponsePreview}</pre>
                      {run.notes && <div className={styles.runNotes}>{run.notes}</div>}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
