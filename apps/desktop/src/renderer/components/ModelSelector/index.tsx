import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useIPC } from '../../hooks'
import type { ModelConfig, ModelProvider } from '@nexusmind/shared'
import styles from './ModelSelector.module.css'

const PROVIDER_LABELS: Record<ModelProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  mistral: 'Mistral',
  cohere: 'Cohere',
  local: 'Local',
  custom: 'Custom',
}

const CAPABILITY_BADGES: Partial<Record<string, { label: string; color: string }>> = {
  vision: { label: 'Vision', color: 'var(--color-blue, #3b82f6)' },
  function_calling: { label: 'Tools', color: 'var(--color-yellow, #f59e0b)' },
  reasoning: { label: 'Reasoning', color: 'var(--color-accent, #7c6af7)' },
  code: { label: 'Code', color: 'var(--color-green, #22c55e)' },
}

// Format context window size
function fmtCtx(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

interface ModelSelectorProps {
  onModelChange?: (model: ModelConfig) => void
}

export function ModelSelector({ onModelChange }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelConfig[]>([])
  const [selectedModel, setSelectedModel] = useState<ModelConfig | null>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const { invoke, loading } = useIPC<'models:list'>()

  // Load models on mount
  useEffect(() => {
    invoke('models:list').then(list => {
      setModels(list)
      if (list.length > 0 && !selectedModel) {
        setSelectedModel(list[0])
      }
    }).catch(console.error)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  // Focus search on open
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50)
    }
  }, [open])

  const handleSelect = useCallback((model: ModelConfig) => {
    setSelectedModel(model)
    setOpen(false)
    setSearch('')
    onModelChange?.(model)
  }, [onModelChange])

  // Group models by provider
  const filteredModels = models.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.provider.toLowerCase().includes(search.toLowerCase()) ||
    m.id.toLowerCase().includes(search.toLowerCase())
  )

  const grouped = filteredModels.reduce<Record<string, ModelConfig[]>>((acc, model) => {
    const key = PROVIDER_LABELS[model.provider] ?? model.provider
    if (!acc[key]) acc[key] = []
    acc[key].push(model)
    return acc
  }, {})

  return (
    <div className={styles.root} ref={dropdownRef}>
      {/* Trigger button */}
      <button
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={loading}
      >
        {selectedModel ? (
          <>
            <span className={styles.triggerProvider}>
              {PROVIDER_LABELS[selectedModel.provider]}
            </span>
            <span className={styles.triggerSep}>/</span>
            <span className={styles.triggerName}>{selectedModel.name}</span>
            <span className={styles.triggerCtx}>{fmtCtx(selectedModel.contextWindow)}</span>
          </>
        ) : (
          <span className={styles.triggerPlaceholder}>
            {loading ? 'Loading models…' : 'Select model'}
          </span>
        )}
        <svg className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} width="10" height="6" viewBox="0 0 10 6" fill="none">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className={styles.dropdown} role="listbox">
          {/* Search */}
          <div className={styles.searchRow}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={styles.searchIcon}>
              <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.3" />
              <line x1="8.5" y1="8.5" x2="11" y2="11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              className={styles.searchInput}
              placeholder="Search models…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && setOpen(false)}
            />
          </div>

          <div className={styles.list}>
            {Object.entries(grouped).length === 0 ? (
              <div className={styles.empty}>
                {models.length === 0 ? 'No models configured' : 'No results'}
              </div>
            ) : (
              Object.entries(grouped).map(([provider, providerModels]) => (
                <div key={provider} className={styles.group}>
                  <div className={styles.groupLabel}>{provider}</div>
                  {providerModels.map(model => (
                    <div
                      key={model.id}
                      className={`${styles.option} ${selectedModel?.id === model.id ? styles.optionSelected : ''}`}
                      onClick={() => handleSelect(model)}
                      role="option"
                      aria-selected={selectedModel?.id === model.id}
                    >
                      <div className={styles.optionMain}>
                        <span className={styles.optionName}>{model.name}</span>
                        <span className={styles.optionCtx}>{fmtCtx(model.contextWindow)} ctx</span>
                      </div>
                      <div className={styles.optionBadges}>
                        {model.capabilities.map(cap => {
                          const badge = CAPABILITY_BADGES[cap]
                          if (!badge) return null
                          return (
                            <span
                              key={cap}
                              className={styles.badge}
                              style={{ color: badge.color, borderColor: badge.color }}
                            >
                              {badge.label}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
