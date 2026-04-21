import crypto from 'crypto'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import type { DatabaseService } from './DatabaseService.js'
import { WindowManager } from '../windows/WindowManager.js'

interface Task {
  id: string
  title: string
  description: string
  status: string
  column: string
  assignee?: string
  subtasks: Subtask[]
  tags: string[]
  priority: string
  createdAt: number
  updatedAt: number
  dueAt?: number
}

interface Subtask {
  id: string
  title: string
  done: boolean
}

export class KanbanService {
  private db!: DatabaseService

  readonly defaultColumns: string[] = ['backlog', 'in_progress', 'in_review', 'done']

  init(): void {
    const registry = ServiceRegistry.getInstance()
    this.db = registry.resolve<DatabaseService>(SERVICE_TOKENS.DB)
    registry.register(SERVICE_TOKENS.KanbanService, this)
  }

  private push(payload: Task): void {
    WindowManager.getInstance().get('main')?.webContents.send('kanban:taskUpdated', payload)
  }

  getTasks(columnId?: string): Task[] {
    const database = this.db.getDb()
    if (columnId) {
      const stmt = database.prepare('SELECT * FROM kanban_tasks WHERE column_id = ? ORDER BY position ASC')
      const rows = stmt.all(columnId) as any[]
      return rows.map((row) => this.rowToTask(row))
    } else {
      const stmt = database.prepare('SELECT * FROM kanban_tasks ORDER BY position ASC')
      const rows = stmt.all() as any[]
      return rows.map((row) => this.rowToTask(row))
    }
  }

  getTask(id: string): Task | null {
    const row = this.db.getDb().prepare('SELECT * FROM kanban_tasks WHERE id = ?').get(id) as any
    return row ? this.rowToTask(row) : null
  }

  createTask(input: Partial<Task>): Task {
    const database = this.db.getDb()
    const now = Date.now()
    const task: Task = {
      id: crypto.randomUUID(),
      title: input.title ?? '',
      description: input.description ?? '',
      status: input.status ?? 'todo',
      column: input.column ?? 'backlog',
      assignee: input.assignee,
      subtasks: input.subtasks ?? [],
      tags: input.tags ?? [],
      priority: input.priority ?? 'medium',
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
      dueAt: input.dueAt,
    }

    const stmt = database.prepare(`
      INSERT INTO kanban_tasks (id, title, description, column_id, position, agent_id, created_at, updated_at, tags, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      task.id,
      task.title,
      task.description,
      task.column,
      0,
      task.assignee ?? null,
      task.createdAt,
      task.updatedAt,
      JSON.stringify(task.tags),
      task.priority,
    )

    this.push(task)
    return task
  }

  updateTask(id: string, updates: Partial<Task>): Task {
    const database = this.db.getDb()
    const now = Date.now()

    const existing = database.prepare('SELECT * FROM kanban_tasks WHERE id = ?').get(id) as any
    if (!existing) {
      throw new Error(`Task not found: ${id}`)
    }

    const current = this.rowToTask(existing)
    const merged: Task = {
      ...current,
      ...updates,
      id,
      updatedAt: now,
    }

    const stmt = database.prepare(`
      UPDATE kanban_tasks
      SET title = ?, description = ?, column_id = ?, agent_id = ?, updated_at = ?, tags = ?, priority = ?
      WHERE id = ?
    `)

    stmt.run(
      merged.title,
      merged.description,
      merged.column,
      merged.assignee ?? null,
      merged.updatedAt,
      JSON.stringify(merged.tags),
      merged.priority,
      id,
    )

    this.push(merged)
    return merged
  }

  moveTask(id: string, columnId: string, position: number): Task {
    const database = this.db.getDb()
    const stmt = database.prepare(`
      UPDATE kanban_tasks SET column_id = ?, position = ?, updated_at = ? WHERE id = ?
    `)
    stmt.run(columnId, position, Date.now(), id)

    const updated = this.getTask(id)
    if (!updated) throw new Error(`Task not found after move: ${id}`)
    this.push(updated)
    return updated
  }

  deleteTask(id: string): void {
    const database = this.db.getDb()
    database.prepare('DELETE FROM kanban_tasks WHERE id = ?').run(id)
  }

  assignToAgent(taskId: string, agentId: string): void {
    const now = Date.now()
    this.db.getDb()
      .prepare('UPDATE kanban_tasks SET agent_id = ?, updated_at = ? WHERE id = ?')
      .run(agentId, now, taskId)

    const updated = this.getTask(taskId)
    if (updated) {
      this.push(updated)
    }
  }

  getNextTask(_agentRole: string): Task | null {
    const row = this.db.getDb().prepare(`
      SELECT * FROM kanban_tasks
      WHERE column_id = 'backlog' AND (agent_id IS NULL OR agent_id = '')
      ORDER BY
        CASE priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END ASC,
        created_at ASC
      LIMIT 1
    `).get() as any

    return row ? this.rowToTask(row) : null
  }

  bulkCreate(tasks: Partial<Task>[]): Task[] {
    const created: Task[] = []

    const txn = this.db.getDb().transaction(() => {
      for (const input of tasks) {
        const task = this._insertTask(input)
        created.push(task)
      }
    })

    txn()

    for (const task of created) {
      this.push(task)
    }

    return created
  }

  private _insertTask(input: Partial<Task>): Task {
    const database = this.db.getDb()
    const now = Date.now()
    const task: Task = {
      id: crypto.randomUUID(),
      title: input.title ?? '',
      description: input.description ?? '',
      status: input.status ?? 'todo',
      column: input.column ?? 'backlog',
      assignee: input.assignee,
      subtasks: input.subtasks ?? [],
      tags: input.tags ?? [],
      priority: input.priority ?? 'medium',
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
      dueAt: input.dueAt,
    }

    database.prepare(`
      INSERT INTO kanban_tasks (id, title, description, column_id, position, agent_id, created_at, updated_at, tags, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.id,
      task.title,
      task.description,
      task.column,
      0,
      task.assignee ?? null,
      task.createdAt,
      task.updatedAt,
      JSON.stringify(task.tags),
      task.priority,
    )

    return task
  }

  private rowToTask(row: any): Task {
    let tags: string[] = []
    try {
      tags = row.tags ? JSON.parse(row.tags) : []
    } catch {
      tags = []
    }

    return {
      id: row.id,
      title: row.title ?? '',
      description: row.description ?? '',
      status: 'todo',
      column: row.column_id ?? 'backlog',
      assignee: row.agent_id ?? undefined,
      subtasks: [],
      tags,
      priority: row.priority ?? 'medium',
      createdAt: row.created_at ?? Date.now(),
      updatedAt: row.updated_at ?? Date.now(),
    }
  }

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'kanban:createTask': (_event: any, task: Partial<Task>) => this.createTask(task),
      'kanban:updateTask': (_event: any, task: Task) => this.updateTask(task.id, task),
      'kanban:deleteTask': (_event: any, taskId: string) => this.deleteTask(taskId),
      'kanban:moveTask': (_event: any, payload: { taskId: string; column: string }) =>
        this.moveTask(payload.taskId, payload.column, 0),
      'kanban:getTasks': (_event: any, columnId?: string) => this.getTasks(columnId),
      'kanban:listTasks': (_event: any) => this.getTasks(),
      'kanban:create': (_event: any, task: Partial<Task>) => this.createTask(task),
      'kanban:update': (_event: any, id: string, updates: Partial<Task>) => this.updateTask(id, updates),
      'kanban:move': (_event: any, id: string, columnId: string, position: number) =>
        this.moveTask(id, columnId, position),
      'kanban:delete': (_event: any, id: string) => this.deleteTask(id),
    }
  }
}
