import crypto from 'crypto'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import type { DatabaseService } from './DatabaseService.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BudgetConfig {
  dailyLimitUSD?: number
  monthlyLimitUSD?: number
  sessionLimitUSD?: number
}

interface PricingEntry {
  inputPer1M: number
  outputPer1M: number
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

const PRICING: Record<string, PricingEntry> = {
  'claude-sonnet-4-6': { inputPer1M: 3, outputPer1M: 15 },
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'gemini-2.0-flash': { inputPer1M: 0.1, outputPer1M: 0.4 },
}

// ---------------------------------------------------------------------------
// BudgetService
// ---------------------------------------------------------------------------

export class BudgetService {
  private db!: DatabaseService
  private config: BudgetConfig = {}

  init(): void {
    this.db = ServiceRegistry.getInstance().resolve<DatabaseService>(SERVICE_TOKENS.DB)
    this._ensureTable()
    ServiceRegistry.getInstance().register(SERVICE_TOKENS.BudgetService, this)
  }

  private _ensureTable(): void {
    this.db.getDb().exec(`
      CREATE TABLE IF NOT EXISTS cost_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        model_id TEXT NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        estimated_cost_usd REAL NOT NULL,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cost_events_session ON cost_events(session_id);
      CREATE INDEX IF NOT EXISTS idx_cost_events_timestamp ON cost_events(timestamp);
    `)
  }

  setConfig(config: BudgetConfig): void {
    this.config = config
  }

  getConfig(): BudgetConfig {
    return this.config
  }

  recordUsage(
    sessionId: string,
    provider: string,
    modelId: string,
    inputTokens: number,
    outputTokens: number,
  ): void {
    const estimatedCostUSD = this._estimateCost(modelId, inputTokens, outputTokens)
    const id = crypto.randomUUID()
    const timestamp = Date.now()

    this.db.getDb().prepare(`
      INSERT INTO cost_events (id, session_id, provider, model_id, input_tokens, output_tokens, estimated_cost_usd, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, sessionId, provider, modelId, inputTokens, outputTokens, estimatedCostUSD, timestamp)
  }

  checkBudget(sessionId?: string): {
    allowed: boolean
    reason?: string
    dailySpend: number
    monthlySpend: number
  } {
    const { dailySpend, monthlySpend } = this._getSpend()

    if (this.config.dailyLimitUSD !== undefined && dailySpend >= this.config.dailyLimitUSD) {
      return {
        allowed: false,
        reason: `Daily limit of $${this.config.dailyLimitUSD.toFixed(2)} reached`,
        dailySpend,
        monthlySpend,
      }
    }

    if (this.config.monthlyLimitUSD !== undefined && monthlySpend >= this.config.monthlyLimitUSD) {
      return {
        allowed: false,
        reason: `Monthly limit of $${this.config.monthlyLimitUSD.toFixed(2)} reached`,
        dailySpend,
        monthlySpend,
      }
    }

    if (sessionId && this.config.sessionLimitUSD !== undefined) {
      const sessionSpend = this._getSessionSpend(sessionId)
      if (sessionSpend >= this.config.sessionLimitUSD) {
        return {
          allowed: false,
          reason: `Session limit of $${this.config.sessionLimitUSD.toFixed(2)} reached`,
          dailySpend,
          monthlySpend,
        }
      }
    }

    return { allowed: true, dailySpend, monthlySpend }
  }

  getDailySpend(): number {
    return this._getSpend().dailySpend
  }

  private _getSpend(): { dailySpend: number; monthlySpend: number } {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

    const dailyRow = this.db.getDb().prepare(`
      SELECT COALESCE(SUM(estimated_cost_usd), 0) as total
      FROM cost_events
      WHERE timestamp >= ?
    `).get(startOfDay) as { total: number }

    const monthlyRow = this.db.getDb().prepare(`
      SELECT COALESCE(SUM(estimated_cost_usd), 0) as total
      FROM cost_events
      WHERE timestamp >= ?
    `).get(startOfMonth) as { total: number }

    return {
      dailySpend: dailyRow.total,
      monthlySpend: monthlyRow.total,
    }
  }

  private _getSessionSpend(sessionId: string): number {
    const row = this.db.getDb().prepare(`
      SELECT COALESCE(SUM(estimated_cost_usd), 0) as total
      FROM cost_events
      WHERE session_id = ?
    `).get(sessionId) as { total: number }

    return row.total
  }

  private _estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
    const pricing = PRICING[modelId] ?? { inputPer1M: 0, outputPer1M: 0 }
    const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M
    const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M
    return inputCost + outputCost
  }

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'budget:check': (_event: any, sessionId?: string) => this.checkBudget(sessionId),
      'budget:setConfig': (_event: any, config: BudgetConfig) => {
        this.setConfig(config)
        return this.getConfig()
      },
      'budget:getDailySpend': () => this.getDailySpend(),
    }
  }
}
