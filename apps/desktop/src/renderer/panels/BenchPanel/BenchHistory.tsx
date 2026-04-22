import React, { useMemo, useState } from 'react'
import type { BenchRunResult, BenchDimension } from '@nexusmind/shared'

const DIM_COLORS: Record<string, string> = {
  quality:       'var(--color-green, #22c55e)',
  speed:         'var(--color-blue, #3b82f6)',
  cost:          'var(--color-yellow, #f59e0b)',
  hallucination: '#f97316',
  complexity:    'var(--color-accent, #7c6af7)',
  reasoning:     '#ec4899',
}

interface BenchHistoryProps {
  runs: BenchRunResult[]
}

function dateGroup(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function BenchHistory({ runs }: BenchHistoryProps) {
  const [filterModel, setFilterModel] = useState('')
  const [filterDim, setFilterDim] = useState<BenchDimension | 'all'>('all')

  const filtered = useMemo(() => {
    return runs.filter(r =>
      (filterModel === '' || r.modelId.toLowerCase().includes(filterModel.toLowerCase())) &&
      (filterDim === 'all' || r.dimension === filterDim)
    )
  }, [runs, filterModel, filterDim])

  const grouped = useMemo(() => {
    const map = new Map<string, BenchRunResult[]>()
    for (const r of filtered) {
      const key = dateGroup(r.startedAt)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return map
  }, [filtered])

  const baseStyle = { fontSize: 12, color: 'var(--color-text)' }
  const mutedStyle = { ...baseStyle, color: 'var(--color-text-muted)' as string }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, height: '100%', overflow: 'hidden' }}>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.08))', flexShrink: 0 }}>
        <input
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--color-border, rgba(255,255,255,0.12))',
            borderRadius: 6,
            color: 'var(--color-text)',
            fontSize: 12,
            padding: '4px 8px',
            width: 160,
          }}
          placeholder="Filter by model…"
          value={filterModel}
          onChange={e => setFilterModel(e.target.value)}
        />
        <select
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--color-border, rgba(255,255,255,0.12))',
            borderRadius: 6,
            color: 'var(--color-text)',
            fontSize: 12,
            padding: '4px 8px',
          }}
          value={filterDim}
          onChange={e => setFilterDim(e.target.value as BenchDimension | 'all')}
        >
          <option value="all">All dimensions</option>
          {(['quality','speed','cost','hallucination','complexity','reasoning'] as BenchDimension[]).map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      {/* Grouped list */}
      <div style={{ flex: 1, overflowY: 'auto' as const }}>
        {grouped.size === 0 ? (
          <div style={{ padding: 32, textAlign: 'center' as const, ...mutedStyle }}>No history yet</div>
        ) : (
          Array.from(grouped.entries()).map(([date, dateRuns]) => (
            <div key={date}>
              <div style={{ padding: '8px 16px 4px', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: 'var(--color-text-muted)' }}>
                {date}
              </div>
              {dateRuns.map(run => (
                <div key={run.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px', borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.04))' }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: DIM_COLORS[run.dimension], minWidth: 80, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                    {run.dimension}
                  </span>
                  <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                    {run.modelId}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)', minWidth: 55, textAlign: 'right' as const }}>
                    {run.durationMs}ms
                  </span>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 700,
                    minWidth: 38,
                    textAlign: 'right' as const,
                    color: run.successScore >= 0.8 ? 'var(--color-green, #22c55e)' : run.successScore >= 0.5 ? 'var(--color-yellow, #f59e0b)' : '#f97316',
                  }}>
                    {Math.round(run.successScore * 100)}%
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
