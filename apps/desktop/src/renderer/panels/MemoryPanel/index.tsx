import React, { useCallback, useState } from 'react'
import { useMemory } from '../../features/memory/useMemory'
import type { MemoryType } from '@nexusmind/shared'
import styles from './MemoryPanel.module.css'

function parseAgentSource(source: string): { id: string; role: string | null } {
  const colonIdx = source.indexOf(':')
  if (colonIdx > -1) {
    return { id: source.slice(0, colonIdx), role: source.slice(colonIdx + 1) }
  }
  return { id: source.slice(0, 8), role: null }
}

const ROLE_COLORS: Record<string, string> = {
  coordinator: 'var(--color-accent, #7c6af7)',
  builder:     'var(--color-green, #22c55e)',
  reviewer:    'var(--color-yellow, #f59e0b)',
  tester:      'var(--color-blue, #3b82f6)',
  docwriter:   'var(--color-text-muted)',
}

const TYPE_COLORS: Record<MemoryType, string> = {
  episodic: 'var(--color-blue, #3b82f6)',
  semantic: 'var(--color-accent)',
  procedural: 'var(--color-yellow)',
  working: 'var(--color-green)',
}

const TYPE_LABELS: Record<MemoryType, string> = {
  episodic: 'Episodic',
  semantic: 'Semantic',
  procedural: 'Procedural',
  working: 'Working',
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(ts).toLocaleDateString()
}

export function MemoryPanel() {
  const memory = useMemory()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await memory.deleteEntry(id)
      if (expandedId === id) setExpandedId(null)
    } catch (err) {
      console.error('Failed to delete memory:', err)
    }
  }, [memory, expandedId])

  const { results, isLoading, query, setQuery, typeFilter, setTypeFilter } = memory

  return (
    <div className={styles.root}>
      {/* Search bar + filters */}
      <div className={styles.searchArea}>
        <div className={styles.searchRow}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={styles.searchIcon}>
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
            <line x1="9.5" y1="9.5" x2="12.5" y2="12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <input
            className={styles.searchInput}
            type="search"
            placeholder="Search memories…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button className={styles.clearBtn} onClick={() => setQuery('')} aria-label="Clear search">
              ×
            </button>
          )}
        </div>
        <div className={styles.filters}>
          {(['all', 'episodic', 'semantic', 'procedural', 'working'] as const).map(type => (
            <button
              key={type}
              className={`${styles.filterChip} ${typeFilter === type ? styles.filterChipActive : ''}`}
              onClick={() => setTypeFilter(type as MemoryType | 'all')}
              style={typeFilter === type && type !== 'all'
                ? { borderColor: TYPE_COLORS[type as MemoryType], color: TYPE_COLORS[type as MemoryType] }
                : {}
              }
            >
              {type === 'all' ? 'All' : TYPE_LABELS[type as MemoryType]}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className={styles.results}>
        {isLoading && results.length === 0 ? (
          <div className={styles.loading}>Searching…</div>
        ) : results.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🧠</div>
            <div className={styles.emptyTitle}>No memories yet</div>
            <div className={styles.emptyText}>
              Agents will store knowledge here as they work
            </div>
          </div>
        ) : (
          results.map(({ entry, similarity }) => {
            const isExpanded = expandedId === entry.id
            return (
              <div
                key={entry.id}
                className={`${styles.resultCard} ${isExpanded ? styles.resultCardExpanded : ''}`}
                onClick={() => setExpandedId(isExpanded ? null : entry.id)}
              >
                <div className={styles.cardHeader}>
                  <div className={styles.cardMeta}>
                    <span
                      className={styles.typeBadge}
                      style={{ color: TYPE_COLORS[entry.type], borderColor: TYPE_COLORS[entry.type] }}
                    >
                      {TYPE_LABELS[entry.type]}
                    </span>
                    <span className={styles.similarity}>
                      {(similarity * 100).toFixed(0)}% match
                    </span>
                    <span className={styles.timestamp}>{relativeTime(entry.createdAt)}</span>
                  </div>
                  <div className={styles.cardActions}>
                    <button
                      className={styles.deleteBtn}
                      onClick={e => handleDelete(entry.id, e)}
                      title="Delete memory"
                      aria-label="Delete memory"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 3h8M5 3V1.5h2V3M4.5 3v6.5h3V3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>

                <div className={`${styles.cardContent} ${isExpanded ? styles.cardContentExpanded : ''}`}>
                  {entry.content}
                </div>

                {isExpanded && (
                  <div className={styles.cardDetails}>
                    {((entry as any).importance ?? 0) > 0 && (
                      <div className={styles.detailRow}>
                        <span className={styles.detailKey}>Importance</span>
                        <div className={styles.importanceBar}>
                          <div
                            className={styles.importanceFill}
                            style={{ width: `${((entry as any).importance ?? 0) * 100}%` }}
                          />
                        </div>
                        <span className={styles.detailVal}>{(((entry as any).importance ?? 0) * 100).toFixed(0)}%</span>
                      </div>
                    )}
                    {(entry.agentId || (entry as any).source) && (() => {
                      const raw: string = (entry as any).source || entry.agentId || ''
                      const parsed = parseAgentSource(raw)
                      return (
                        <div className={styles.detailRow}>
                          <span className={styles.detailKey}>Agent</span>
                          <span className={`${styles.detailVal} ${styles.mono}`}>
                            {parsed.id.slice(0, 12)}
                          </span>
                          {parsed.role && (
                            <span
                              className={styles.roleBadge}
                              style={{ color: ROLE_COLORS[parsed.role] ?? 'inherit', borderColor: ROLE_COLORS[parsed.role] ?? 'inherit' }}
                            >
                              {parsed.role}
                            </span>
                          )}
                        </div>
                      )
                    })()}
                    {(entry.tags ?? []).length > 0 && (
                      <div className={styles.detailRow}>
                        <span className={styles.detailKey}>Tags</span>
                        <div className={styles.tagList}>
                          {(entry.tags ?? []).map(tag => (
                            <span key={tag} className={styles.tag}>{tag}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
