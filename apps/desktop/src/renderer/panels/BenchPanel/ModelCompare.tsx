import React from 'react'
import type { BenchRunResult, BenchDimension } from '@nexusmind/shared'
import styles from './BenchPanel.module.css'

const DIMENSIONS: BenchDimension[] = ['quality', 'speed', 'cost', 'hallucination', 'complexity', 'reasoning']

const DIM_COLORS: Record<string, string> = {
  quality:       'var(--color-green, #22c55e)',
  speed:         'var(--color-blue, #3b82f6)',
  cost:          'var(--color-yellow, #f59e0b)',
  hallucination: '#f97316',
  complexity:    'var(--color-accent, #7c6af7)',
  reasoning:     '#ec4899',
}

interface ModelCompareProps {
  runs: BenchRunResult[]
}

export function ModelCompare({ runs }: ModelCompareProps) {
  // Group runs by modelId, then by dimension — compute average score
  const models = Array.from(new Set(runs.map(r => r.modelId)))
  if (models.length === 0) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
        Run benchmarks against multiple models to compare them here.
      </div>
    )
  }

  const avgScore = (modelId: string, dim: BenchDimension): number | null => {
    const relevant = runs.filter(r => r.modelId === modelId && r.dimension === dim)
    if (relevant.length === 0) return null
    return relevant.reduce((s, r) => s + r.successScore, 0) / relevant.length
  }

  return (
    <div style={{ padding: 16, overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '6px 12px', color: 'var(--color-text-muted)', fontWeight: 600, fontSize: 11, letterSpacing: '0.06em' }}>
              MODEL
            </th>
            {DIMENSIONS.map(d => (
              <th key={d} style={{ padding: '6px 10px', color: DIM_COLORS[d], fontWeight: 600, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'center' }}>
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.map(modelId => (
            <tr key={modelId} style={{ borderTop: '1px solid var(--color-border, rgba(255,255,255,0.06))' }}>
              <td style={{ padding: '8px 12px', color: 'var(--color-text)', fontFamily: 'monospace', fontSize: 11 }}>
                {modelId}
              </td>
              {DIMENSIONS.map(dim => {
                const score = avgScore(modelId, dim)
                if (score === null) {
                  return <td key={dim} style={{ padding: '8px 10px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>—</td>
                }
                const pct = Math.round(score * 100)
                const color = score >= 0.8 ? 'var(--color-green, #22c55e)' : score >= 0.5 ? 'var(--color-yellow, #f59e0b)' : '#f97316'
                return (
                  <td key={dim} style={{ padding: '8px 10px', textAlign: 'center' }}>
                    <span style={{ color, fontWeight: 700, fontSize: 13 }}>{pct}%</span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
