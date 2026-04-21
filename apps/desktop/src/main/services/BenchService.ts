import crypto from 'crypto'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import { ALL_BENCH_TASKS } from './BenchSeed.js'
import type { BenchTask, BenchDimension, BenchRunConfig, BenchRunResult } from '@nexusmind/shared'
import type { DatabaseService } from './DatabaseService.js'
import type { ModelRouter } from './ModelRouter.js'

export class BenchService {
  private db!: DatabaseService
  private router!: ModelRouter

  init(): void {
    const registry = ServiceRegistry.getInstance()
    this.db = registry.resolve<DatabaseService>(SERVICE_TOKENS.DB)
    this.router = registry.resolve<ModelRouter>(SERVICE_TOKENS.ModelRouter)
    this.seedTasksIfEmpty()
    registry.register(SERVICE_TOKENS.BenchService, this)
  }

  seedTasksIfEmpty(): void {
    const count = (this.db.getDb().prepare('SELECT COUNT(*) as n FROM bench_tasks').get() as any).n
    if (count > 0) return
    const insert = this.db.getDb().prepare(
      `INSERT OR IGNORE INTO bench_tasks (id, dimension, name, description, input, expected_behavior, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    const insertAll = this.db.getDb().transaction((tasks: BenchTask[]) => {
      for (const t of tasks) {
        insert.run(t.id, t.dimension, t.name, t.description, t.input, t.expectedBehavior ?? null, t.metadata ? JSON.stringify(t.metadata) : null)
      }
    })
    insertAll(ALL_BENCH_TASKS)
  }

  listTasks(dimension?: BenchDimension): BenchTask[] {
    const rows = dimension
      ? (this.db.getDb().prepare('SELECT * FROM bench_tasks WHERE dimension = ?').all(dimension) as any[])
      : (this.db.getDb().prepare('SELECT * FROM bench_tasks').all() as any[])
    return rows.map(r => ({
      id: r.id,
      dimension: r.dimension as BenchDimension,
      name: r.name,
      description: r.description,
      input: r.input,
      expectedBehavior: r.expected_behavior ?? undefined,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    }))
  }

  async listModels(): Promise<Array<{ id: string; provider: string; name: string }>> {
    try {
      // Use the IPC-level KNOWN_MODELS catalogue via the handler exposed on the router
      const handlers = this.router.getHandlers()
      const result = handlers['models:list']?.(null as any)
      if (Array.isArray(result)) {
        return result.map((m: any) => ({ id: m.id, provider: m.provider, name: m.name }))
      }
      return []
    } catch {
      return []
    }
  }

  async runTask(taskId: string, config: BenchRunConfig): Promise<BenchRunResult> {
    const taskRow = this.db.getDb().prepare('SELECT * FROM bench_tasks WHERE id = ?').get(taskId) as any
    if (!taskRow) throw new Error(`[BenchService] Task not found: ${taskId}`)
    const task: BenchTask = {
      id: taskRow.id,
      dimension: taskRow.dimension,
      name: taskRow.name,
      description: taskRow.description,
      input: taskRow.input,
      expectedBehavior: taskRow.expected_behavior ?? undefined,
    }

    const modelConfig = {
      id: config.modelId,
      provider: config.provider,
      name: config.modelId,
      capabilities: [] as any[],
      contextWindow: 128_000,
      maxTokens: config.maxTokens ?? 512,
    }

    const messages = [
      {
        id: crypto.randomUUID(),
        agentId: 'bench',
        role: 'user' as any,
        content: task.input,
        timestamp: Date.now(),
      },
    ]

    const startedAt = Date.now()
    let rawResponse = ''
    let promptTokens: number | undefined
    let completionTokens: number | undefined

    try {
      for await (const chunk of this.router.route(modelConfig as any, messages)) {
        if (chunk.content) rawResponse += chunk.content
        if (chunk.usage) {
          promptTokens = chunk.usage.promptTokens
          completionTokens = chunk.usage.completionTokens
        }
        if (chunk.isDone) break
      }
    } catch (err) {
      rawResponse = `[ERROR] ${String(err)}`
    }

    const endedAt = Date.now()
    const durationMs = endedAt - startedAt
    const successScore = this._scoreResponse(task, rawResponse, durationMs)
    const rawResponsePreview = rawResponse.slice(0, 1000)

    const result: BenchRunResult = {
      id: crypto.randomUUID(),
      taskId: task.id,
      dimension: task.dimension,
      modelId: config.modelId,
      provider: config.provider,
      startedAt,
      endedAt,
      durationMs,
      promptTokens,
      completionTokens,
      successScore,
      rawResponsePreview,
    }

    this.db.getDb().prepare(
      `INSERT INTO bench_runs (id, task_id, dimension, model_id, provider, started_at, ended_at, duration_ms,
        prompt_tokens, completion_tokens, cost_usd, success_score, notes, raw_response_preview)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      result.id, result.taskId, result.dimension, result.modelId, result.provider,
      result.startedAt, result.endedAt, result.durationMs,
      result.promptTokens ?? null, result.completionTokens ?? null,
      null, result.successScore, result.notes ?? null, result.rawResponsePreview,
    )

    return result
  }

  async runBatch(taskIds: string[], config: BenchRunConfig): Promise<BenchRunResult[]> {
    const results: BenchRunResult[] = []
    for (const id of taskIds) {
      try {
        results.push(await this.runTask(id, config))
      } catch (err) {
        console.error(`[BenchService] runBatch task ${id} failed:`, err)
      }
    }
    return results
  }

  listRuns(filters?: { dimension?: BenchDimension; modelId?: string }): BenchRunResult[] {
    let sql = 'SELECT * FROM bench_runs'
    const params: any[] = []
    const clauses: string[] = []
    if (filters?.dimension) { clauses.push('dimension = ?'); params.push(filters.dimension) }
    if (filters?.modelId) { clauses.push('model_id = ?'); params.push(filters.modelId) }
    if (clauses.length > 0) sql += ' WHERE ' + clauses.join(' AND ')
    sql += ' ORDER BY started_at DESC'
    const rows = this.db.getDb().prepare(sql).all(...params) as any[]
    return rows.map(r => ({
      id: r.id,
      taskId: r.task_id,
      dimension: r.dimension as BenchDimension,
      modelId: r.model_id,
      provider: r.provider,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      durationMs: r.duration_ms,
      promptTokens: r.prompt_tokens ?? undefined,
      completionTokens: r.completion_tokens ?? undefined,
      costUsd: r.cost_usd ?? undefined,
      successScore: r.success_score,
      notes: r.notes ?? undefined,
      rawResponsePreview: r.raw_response_preview,
    }))
  }

  private _scoreResponse(task: BenchTask, response: string, durationMs: number): number {
    const lower = response.toLowerCase()
    switch (task.dimension) {
      case 'hallucination': {
        // Good: admits uncertainty or corrects the false premise
        const positive = ['does not exist', 'doesn\'t exist', 'no such', 'not a real', 'not exist', 'cannot find', 'not aware', 'made up', 'incorrect', 'actually']
        return positive.some(p => lower.includes(p)) ? 0.9 : 0.3
      }
      case 'complexity':
      case 'reasoning': {
        // Heuristic: longer structured responses score higher (up to a point)
        const words = response.trim().split(/\s+/).length
        return Math.min(1, words / 80)
      }
      case 'quality': {
        // Check for code block presence for coding tasks
        if (task.input.toLowerCase().includes('write') || task.input.toLowerCase().includes('function')) {
          return response.includes('```') ? 0.85 : 0.5
        }
        return Math.min(1, response.trim().split(/\s+/).length / 30)
      }
      case 'speed': {
        // Score inversely by latency: under 1s = 1.0, 5s = 0.5, 10s+ = 0.1
        if (durationMs < 1000) return 1.0
        if (durationMs < 3000) return 0.8
        if (durationMs < 5000) return 0.6
        if (durationMs < 8000) return 0.4
        return 0.2
      }
      case 'cost': {
        // Score inversely by response length (conciseness)
        const len = response.trim().length
        if (len < 20) return 1.0
        if (len < 60) return 0.9
        if (len < 150) return 0.7
        if (len < 300) return 0.5
        return 0.3
      }
      default:
        return 0.5
    }
  }

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'bench:listTasks': (_event: any, dimension?: BenchDimension) => this.listTasks(dimension),
      'bench:listModels': () => this.listModels(),
      'bench:runTask': (_event: any, taskId: string, config: BenchRunConfig) => this.runTask(taskId, config),
      'bench:runBatch': (_event: any, taskIds: string[], config: BenchRunConfig) => this.runBatch(taskIds, config),
      'bench:listRuns': (_event: any, filters?: { dimension?: BenchDimension; modelId?: string }) => this.listRuns(filters),
    }
  }
}
