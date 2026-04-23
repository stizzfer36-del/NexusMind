import React, { useState, useEffect, useCallback } from 'react'
import styles from './BudgetPanel.module.css'

interface BudgetConfig {
  dailyLimitUSD?: number
  monthlyLimitUSD?: number
  sessionLimitUSD?: number
}

interface SpendData {
  dailySpend: number
  monthlySpend: number
  sessionSpend?: number
  allowed: boolean
  reason?: string
}

interface CostEvent {
  id: string
  sessionId: string
  provider: string
  modelId: string
  inputTokens: number
  outputTokens: number
  estimatedCostUSD: number
  timestamp: number
}

const PRICING = {
  'claude-sonnet-4-6': { inputPer1M: 3, outputPer1M: 15 },
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'gemini-2.0-flash': { inputPer1M: 0.1, outputPer1M: 0.4 },
}

export function BudgetPanel(): React.ReactElement {
  const [config, setConfig] = useState<BudgetConfig>({})
  const [spend, setSpend] = useState<SpendData | null>(null)
  const [recentCosts, setRecentCosts] = useState<CostEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [tempLimits, setTempLimits] = useState<BudgetConfig>({})

  useEffect(() => {
    loadBudgetData()
    const interval = setInterval(loadBudgetData, 5000)
    return () => clearInterval(interval)
  }, [])

  const loadBudgetData = async () => {
    try {
      const [configResult, spendResult, costsResult] = await Promise.all([
        window.electronAPI.invoke('budget:getConfig'),
        window.electronAPI.invoke('budget:check'),
        window.electronAPI.invoke('budget:getRecentCosts', 50),
      ])

      if (configResult) setConfig(configResult)
      if (spendResult) setSpend(spendResult)
      if (costsResult) setRecentCosts(costsResult)
    } catch (err) {
      console.error('Failed to load budget data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveLimits = async () => {
    try {
      await window.electronAPI.invoke('budget:setConfig', tempLimits)
      setConfig(tempLimits)
      setEditMode(false)
      loadBudgetData()
    } catch (err) {
      console.error('Failed to save budget config:', err)
    }
  }

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`
    return tokens.toString()
  }

  const calculateProgress = (current: number, limit?: number): number => {
    if (!limit || limit === 0) return 0
    return Math.min((current / limit) * 100, 100)
  }

  const getProgressColor = (percentage: number): string => {
    if (percentage >= 90) return '#ef4444'
    if (percentage >= 75) return '#f59e0b'
    return '#22c55e'
  }

  const costsByModel = recentCosts.reduce((acc, cost) => {
    if (!acc[cost.modelId]) {
      acc[cost.modelId] = { cost: 0, tokens: 0, calls: 0 }
    }
    acc[cost.modelId].cost += cost.estimatedCostUSD
    acc[cost.modelId].tokens += cost.inputTokens + cost.outputTokens
    acc[cost.modelId].calls += 1
    return acc
  }, {} as Record<string, { cost: number; tokens: number; calls: number }>)

  if (isLoading) {
    return <div className={styles.loading}>Loading budget data...</div>
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2>Budget & Pricing</h2>
          <p className={styles.subtitle}>Transparent pricing. No surprises. You control the limits.</p>
        </div>
        <div className={styles.antiCursor}>
          <span className={styles.badge}>✓ Anti-Cursor</span>
          <span className={styles.badgeSub}>No credit system. No hidden fees.</span>
        </div>
      </div>

      {spend && !spend.allowed && (
        <div className={styles.alert}>
          <strong>Budget Limit Reached:</strong> {spend.reason}
        </div>
      )}

      <div className={styles.grid}>
        <div className={styles.card}>
          <h3>Daily Spend</h3>
          <div className={styles.amount}>{formatCurrency(spend?.dailySpend || 0)}</div>
          {config.dailyLimitUSD && (
            <>
              <div className={styles.limit}>of {formatCurrency(config.dailyLimitUSD)} limit</div>
              <div className={styles.progressBar}>
                <div 
                  className={styles.progressFill}
                  style={{ 
                    width: `${calculateProgress(spend?.dailySpend || 0, config.dailyLimitUSD)}%`,
                    backgroundColor: getProgressColor(calculateProgress(spend?.dailySpend || 0, config.dailyLimitUSD))
                  }}
                />
              </div>
            </>
          )}
        </div>

        <div className={styles.card}>
          <h3>Monthly Spend</h3>
          <div className={styles.amount}>{formatCurrency(spend?.monthlySpend || 0)}</div>
          {config.monthlyLimitUSD && (
            <>
              <div className={styles.limit}>of {formatCurrency(config.monthlyLimitUSD)} limit</div>
              <div className={styles.progressBar}>
                <div 
                  className={styles.progressFill}
                  style={{ 
                    width: `${calculateProgress(spend?.monthlySpend || 0, config.monthlyLimitUSD)}%`,
                    backgroundColor: getProgressColor(calculateProgress(spend?.monthlySpend || 0, config.monthlyLimitUSD))
                  }}
                />
              </div>
            </>
          )}
        </div>

        <div className={styles.card}>
          <h3>Session Spend</h3>
          <div className={styles.amount}>{formatCurrency(spend?.sessionSpend || 0)}</div>
          {config.sessionLimitUSD && (
            <>
              <div className={styles.limit}>of {formatCurrency(config.sessionLimitUSD)} limit</div>
              <div className={styles.progressBar}>
                <div 
                  className={styles.progressFill}
                  style={{ 
                    width: `${calculateProgress(spend?.sessionSpend || 0, config.sessionLimitUSD)}%`,
                    backgroundColor: getProgressColor(calculateProgress(spend?.sessionSpend || 0, config.sessionLimitUSD))
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3>Budget Limits</h3>
          {!editMode ? (
            <button className={styles.editBtn} onClick={() => { setTempLimits(config); setEditMode(true); }}>
              Edit Limits
            </button>
          ) : (
            <div className={styles.editActions}>
              <button className={styles.saveBtn} onClick={handleSaveLimits}>Save</button>
              <button className={styles.cancelBtn} onClick={() => setEditMode(false)}>Cancel</button>
            </div>
          )}
        </div>

        {editMode ? (
          <div className={styles.limitsForm}>
            <div className={styles.formRow}>
              <label>Daily Limit ($)</label>
              <input
                type="number"
                value={tempLimits.dailyLimitUSD || ''}
                onChange={(e) => setTempLimits({ ...tempLimits, dailyLimitUSD: parseFloat(e.target.value) || undefined })}
                placeholder="No limit"
                min="0"
                step="0.01"
              />
            </div>
            <div className={styles.formRow}>
              <label>Monthly Limit ($)</label>
              <input
                type="number"
                value={tempLimits.monthlyLimitUSD || ''}
                onChange={(e) => setTempLimits({ ...tempLimits, monthlyLimitUSD: parseFloat(e.target.value) || undefined })}
                placeholder="No limit"
                min="0"
                step="0.01"
              />
            </div>
            <div className={styles.formRow}>
              <label>Session Limit ($)</label>
              <input
                type="number"
                value={tempLimits.sessionLimitUSD || ''}
                onChange={(e) => setTempLimits({ ...tempLimits, sessionLimitUSD: parseFloat(e.target.value) || undefined })}
                placeholder="No limit"
                min="0"
                step="0.01"
              />
            </div>
          </div>
        ) : (
          <div className={styles.limitsDisplay}>
            <div className={styles.limitItem}>
              <span>Daily:</span>
              <span>{config.dailyLimitUSD ? formatCurrency(config.dailyLimitUSD) : 'No limit'}</span>
            </div>
            <div className={styles.limitItem}>
              <span>Monthly:</span>
              <span>{config.monthlyLimitUSD ? formatCurrency(config.monthlyLimitUSD) : 'No limit'}</span>
            </div>
            <div className={styles.limitItem}>
              <span>Session:</span>
              <span>{config.sessionLimitUSD ? formatCurrency(config.sessionLimitUSD) : 'No limit'}</span>
            </div>
          </div>
        )}
      </div>

      <div className={styles.section}>
        <h3>Cost Breakdown by Model</h3>
        <div className={styles.modelTable}>
          <div className={styles.tableHeader}>
            <span>Model</span>
            <span>Calls</span>
            <span>Tokens</span>
            <span>Cost</span>
          </div>
          {Object.entries(costsByModel)
            .sort((a, b) => b[1].cost - a[1].cost)
            .map(([modelId, data]) => (
              <div key={modelId} className={styles.tableRow}>
                <span className={styles.modelName}>{modelId}</span>
                <span>{data.calls}</span>
                <span>{formatTokens(data.tokens)}</span>
                <span className={styles.cost}>{formatCurrency(data.cost)}</span>
              </div>
            ))}
          {Object.keys(costsByModel).length === 0 && (
            <div className={styles.empty}>No costs recorded yet</div>
          )}
        </div>
      </div>

      <div className={styles.section}>
        <h3>Recent Activity</h3>
        <div className={styles.activityList}>
          {recentCosts.slice(0, 20).map((cost) => (
            <div key={cost.id} className={styles.activityItem}>
              <div className={styles.activityMain}>
                <span className={styles.activityModel}>{cost.modelId}</span>
                <span className={styles.activityCost}>{formatCurrency(cost.estimatedCostUSD)}</span>
              </div>
              <div className={styles.activityDetails}>
                <span>{formatTokens(cost.inputTokens + cost.outputTokens)} tokens</span>
                <span>•</span>
                <span>{new Date(cost.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          ))}
          {recentCosts.length === 0 && (
            <div className={styles.empty}>No recent activity</div>
          )}
        </div>
      </div>

      <div className={styles.section}>
        <h3>Pricing Transparency</h3>
        <div className={styles.pricingTable}>
          <div className={styles.tableHeader}>
            <span>Model</span>
            <span>Input (per 1M tokens)</span>
            <span>Output (per 1M tokens)</span>
          </div>
          {Object.entries(PRICING).map(([model, pricing]) => (
            <div key={model} className={styles.tableRow}>
              <span className={styles.modelName}>{model}</span>
              <span>${pricing.inputPer1M.toFixed(2)}</span>
              <span>${pricing.outputPer1M.toFixed(2)}</span>
            </div>
          ))}
        </div>
        <p className={styles.pricingNote}>
          Prices reflect actual API costs from providers. NexusMind does not add markup.
        </p>
      </div>

      <div className={styles.footer}>
        <div className={styles.cursorComparison}>
          <h4>🎯 Why NexusMind Pricing Wins</h4>
          <ul>
            <li><strong>No credit system</strong> — See exactly what you spend in real-time</li>
            <li><strong>No hidden fees</strong> — Pay only what the API costs, zero markup</li>
            <li><strong>Hard limits</strong> — Set daily/monthly/session caps, never get surprised</li>
            <li><strong>BYOK support</strong> — Bring your own API key, use your own credits</li>
            <li><strong>Full transparency</strong> — Every token tracked, every cost visible</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
