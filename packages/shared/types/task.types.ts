export type TaskId = string

export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  BLOCKED = 'blocked',
  IN_REVIEW = 'in_review',
  DONE = 'done',
  ARCHIVED = 'archived'
}

export enum TaskColumn {
  BACKLOG = 'backlog',
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  REVIEW = 'review',
  DONE = 'done'
}

export interface Subtask {
  id: TaskId
  title: string
  status: TaskStatus
  assignee?: string
  createdAt: number
  updatedAt: number
}

export interface Task {
  id: TaskId
  title: string
  description: string
  status: TaskStatus
  column: TaskColumn
  assignee?: string
  subtasks: Subtask[]
  tags: string[]
  priority: 'low' | 'medium' | 'high' | 'critical'
  createdAt: number
  updatedAt: number
  dueAt?: number
}
