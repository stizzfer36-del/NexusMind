import React, { useCallback, useState, useEffect } from 'react'
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
  const [rulesContent, setRulesContent] = useState('')
  const [rulesModified, setRulesModified] = useState(false)
  const [activeTab, setActiveTab] = useState<'memories' | 'rules'>('memories')
  const [memoryStats, setMemoryStats] = useState({ count: 0, types: {} as Record<string, number> })

  useEffect(() => {
    loadRulesFile()
    loadMemoryStats()
  }, [])

  const loadRulesFile = async () => {
    try {
      const result = await window.electronAPI.invoke('file:read', '.nexusrules')
      if (result.success) {
        setRulesContent(result.content)
        setRulesModified(false)
      }
    } catch {
      setRulesContent('# NexusMind Project Rules\n\n# Add project-specific instructions here\n# These rules are automatically loaded into every AI session\n\n# Example:\n# - Use TypeScript strict mode\n# - Follow conventional commits\n# - Write tests for all new features\n')
    }
  }

  const loadMemoryStats = async () => {
    try {
      const allMemories = await window.electronAPI.invoke('memory:list')
      const types = allMemories.reduce((acc: Record<string, number>, m: any) => {
        acc[m.type] = (acc[m.type] || 0) + 1
        return acc
      }, {})
      setMemoryStats({ count: allMemories.length, types })
    } catch (err) {
      console.error('Failed to load memory stats:', err)
    }
  }

  const saveRulesFile = async () => {
    try {
      await window.electronAPI.invoke('file:write', '.nexusrules', rulesContent)
      setRulesModified(false)
    } catch (err) {
      console.error('Failed to save rules:', err)
    }
  }

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await memory.deleteEntry(id)
      if (expandedId === id) setExpandedId(null)
      loadMemoryStats()
    } catch (err) {
      console.error('Failed to delete memory:', err)
    }
  }, [memory, expandedId])

  const { results, isLoading, query, setQuery, typeFilter, setTypeFilter } = memory

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <h2>NexusMemory</h2>
          <p className={styles.subtitle}>Persistent memory across sessions — the anti-Cursor advantage</p>
        </div>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{memoryStats.count}</span>
            <span className={styles.statLabel}>memories</span>
          </div>
          {Object.entries(memoryStats.types).map(([type, count]) => (
            <div key={type} className={styles.stat}>
              <span className={styles.statValue} style={{ color: TYPE_COLORS[type as MemoryType] }}>{count}</span>
              <span className={styles.statLabel}>{type}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'memories' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('memories')}
        >
          Memories
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'rules' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('rules')}
        >
          .nexusrules
        </button>
      </div>

      {activeTab === 'rules' ? (
        <div className={styles.rulesPanel}>
          <div className={styles.rulesHeader}>
            <div>
              <h3>Project Rules</h3>
              <p className={styles.rulesSubtitle}>
                These rules are automatically loaded into every AI session. 
                Define coding standards, patterns, and conventions here.
              </p>
            </div>
            <div className={styles.rulesActions}>
              {rulesModified && <span className={styles.modifiedIndicator}>Modified</span>}
              <button 
                className={styles.saveBtn} 
                onClick={saveRulesFile}
                disabled={!rulesModified}
              >
                Save Rules
              </button>
            </div>
          </div>
          <textarea
            className={styles.rulesEditor}
            value={rulesContent}
            onChange={(e) => { setRulesContent(e.target.value); setRulesModified(true); }}
            spellCheck={false}
          />
          <div className={styles.rulesHelp}>
            <h4>Why .nexusrules matters (vs Cursor's context rot):</h4>
            <ul>
              <li><strong>Persistent across sessions</strong> — Unlike Cursor, agents remember these rules forever</li>
              <li><strong>Project-specific</strong> — Each repo can have its own coding standards</li>
              <li><strong>Auto-loaded</strong> — Every new chat starts with full context</li>
              <li><strong>No priming needed</strong> — No more "reminding the AI" every session</li>
            </ul>
          </div>
        </div>
      ) : (
        <>
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
          <div className={styles.contextRotBanner}>
            <div className={styles.bannerIcon}>🧠</div>
            <div className={styles.bannerContent}>
              <h4>Solving Cursor's "Context Rot" Problem</h4>
              <p>
                Cursor users report AI forgetting decisions after 30 prompts. NexusMind's persistent memory 
                stores every architectural decision, pattern, and convention — automatically retrieved in every session.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
