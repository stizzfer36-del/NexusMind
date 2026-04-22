import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useIPC, useIPCEvent } from '../../hooks'
import type { Task } from '@nexusmind/shared'
import styles from './KanbanPanel.module.css'

type ColumnId = 'backlog' | 'in_progress' | 'review' | 'done'

const COLUMNS: { id: ColumnId; label: string; accent: string }[] = [
  { id: 'backlog', label: 'Backlog', accent: 'var(--color-text-muted)' },
  { id: 'in_progress', label: 'In Progress', accent: 'var(--color-yellow)' },
  { id: 'review', label: 'In Review', accent: 'var(--color-blue, #3b82f6)' },
  { id: 'done', label: 'Done', accent: 'var(--color-green)' },
]

const PRIORITY_COLORS: Record<Task['priority'], string> = {
  low: 'var(--color-text-muted)',
  medium: 'var(--color-blue, #3b82f6)',
  high: 'var(--color-yellow)',
  critical: 'var(--color-red)',
}

export function KanbanPanel() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [addingToColumn, setAddingToColumn] = useState<ColumnId | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [dragOverColumn, setDragOverColumn] = useState<ColumnId | null>(null)
  const dragTaskRef = useRef<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const listIPC = useIPC<'kanban:listTasks'>()
  const createIPC = useIPC<'kanban:createTask'>()
  const updateIPC = useIPC<'kanban:updateTask'>()
  const deleteIPC = useIPC<'kanban:deleteTask'>()
  const moveIPC = useIPC<'kanban:moveTask'>()

  // Load tasks
  useEffect(() => {
    setLoading(true)
    listIPC.invoke('kanban:listTasks')
      .then(res => { if (Array.isArray(res)) setTasks(res) })
      .catch(err => setLoadError(String(err)))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for real-time task updates
  useIPCEvent('kanban:taskUpdated', useCallback((task: Task) => {
    setTasks(prev => {
      const idx = prev.findIndex(t => t.id === task.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = task
        return next
      }
      return [...prev, task]
    })
  }, []))

  const getColumnTasks = (col: ColumnId) =>
    tasks.filter(t => t.column === col)

  // Drag-and-drop handlers
  const onDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    dragTaskRef.current = taskId
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', taskId)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent, col: ColumnId) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverColumn(col)
  }, [])

  const onDragLeave = useCallback(() => {
    setDragOverColumn(null)
  }, [])

  const onDrop = useCallback(async (e: React.DragEvent, col: ColumnId) => {
    e.preventDefault()
    setDragOverColumn(null)
    const taskId = dragTaskRef.current
    if (!taskId) return
    dragTaskRef.current = null

    try {
      const result = await moveIPC.invoke('kanban:moveTask', { taskId, column: col as any })
      if (result && 'id' in result) {
        setTasks(prev => prev.map(t => t.id === taskId ? result as Task : t))
      }
    } catch (err) {
      console.error('Failed to move task:', err)
    }
  }, [moveIPC])

  const handleAddTask = useCallback(async (col: ColumnId) => {
    if (!newTaskTitle.trim()) return
    try {
      const result = await createIPC.invoke('kanban:createTask', {
        title: newTaskTitle.trim(),
        description: '',
        status: 'todo' as any,
        column: col as any,
        subtasks: [],
        tags: [],
        priority: 'medium',
      })
      if (result && 'id' in result) {
        setTasks(prev => [...prev, result as Task])
      }
      setNewTaskTitle('')
      setAddingToColumn(null)
    } catch (err) {
      console.error('Failed to create task:', err)
    }
  }, [createIPC, newTaskTitle])

  const handleDeleteTask = useCallback(async (taskId: string) => {
    try {
      await deleteIPC.invoke('kanban:deleteTask', taskId)
      setTasks(prev => prev.filter(t => t.id !== taskId))
      if (editingTask?.id === taskId) setEditingTask(null)
    } catch (err) {
      console.error('Failed to delete task:', err)
    }
  }, [deleteIPC, editingTask])

  const handleSaveEdit = useCallback(async () => {
    if (!editingTask) return
    try {
      const result = await updateIPC.invoke('kanban:updateTask', editingTask)
      if (result && 'id' in result) {
        setTasks(prev => prev.map(t => t.id === (result as Task).id ? result as Task : t))
      }
      setEditingTask(null)
    } catch (err) {
      console.error('Failed to update task:', err)
    }
  }, [updateIPC, editingTask])

  return (
    <div className={styles.root}>
      {loading ? (
        <div className={styles.boardLoading}>
          {[0,1,2,3].map(i => <div key={i} className={styles.columnSkeleton} />)}
        </div>
      ) : loadError ? (
        <div className={styles.boardError}>
          <span>Kanban service unavailable</span>
          <span className={styles.boardErrorDetail}>{loadError}</span>
        </div>
      ) : (
        <div className={styles.board}>
          {COLUMNS.map(col => {
            const colTasks = getColumnTasks(col.id)
            return (
              <div
                key={col.id}
                className={`${styles.column} ${dragOverColumn === col.id ? styles.columnDragOver : ''}`}
                onDragOver={e => onDragOver(e, col.id)}
                onDragLeave={onDragLeave}
                onDrop={e => onDrop(e, col.id)}
              >
                {/* Column header */}
                <div className={styles.columnHeader}>
                  <div className={styles.columnTitle}>
                    <span className={styles.columnDot} style={{ background: col.accent }} />
                    <span>{col.label}</span>
                    <span className={styles.columnCount}>{colTasks.length}</span>
                  </div>
                  <button
                    className={styles.addBtn}
                    onClick={() => {
                      setAddingToColumn(col.id)
                      setNewTaskTitle('')
                    }}
                    title="Add task"
                  >
                    +
                  </button>
                </div>

                {/* Add task form */}
                {addingToColumn === col.id && (
                  <div className={styles.addForm}>
                    <input
                      className={styles.addInput}
                      placeholder="Task title…"
                      value={newTaskTitle}
                      onChange={e => setNewTaskTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddTask(col.id)
                        if (e.key === 'Escape') setAddingToColumn(null)
                      }}
                      autoFocus
                    />
                    <div className={styles.addActions}>
                      <button className={styles.addConfirm} onClick={() => handleAddTask(col.id)}>Add</button>
                      <button className={styles.addCancel} onClick={() => setAddingToColumn(null)}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* Task cards */}
                <div className={styles.cards}>
                  {colTasks.map(task => (
                    <div
                      key={task.id}
                      className={styles.card}
                      draggable
                      onDragStart={e => onDragStart(e, task.id)}
                      onClick={() => setEditingTask(task)}
                      role="article"
                    >
                      <div className={styles.cardTitle}>{task.title}</div>
                      <div className={styles.cardMeta}>
                        <span
                          className={styles.priorityBadge}
                          style={{ color: PRIORITY_COLORS[task.priority], borderColor: PRIORITY_COLORS[task.priority] }}
                        >
                          {task.priority}
                        </span>
                        {task.tags.map(tag => (
                          <span key={tag} className={styles.tag}>{tag}</span>
                        ))}
                      </div>
                      {task.assignee && (
                        <div className={styles.cardAssignee}>
                          <span className={styles.assigneeAvatar}>
                            {task.assignee.charAt(0).toUpperCase()}
                          </span>
                          <span className={styles.assigneeName}>{task.assignee}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Edit modal */}
      {editingTask && (
        <div className={styles.modalOverlay} onClick={() => setEditingTask(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Edit Task</h3>
              <button className={styles.modalClose} onClick={() => setEditingTask(null)}>×</button>
            </div>
            <div className={styles.modalBody}>
              <label className={styles.fieldLabel}>Title</label>
              <input
                className={styles.fieldInput}
                value={editingTask.title}
                onChange={e => setEditingTask({ ...editingTask, title: e.target.value })}
              />
              <label className={styles.fieldLabel}>Description</label>
              <textarea
                className={styles.fieldTextarea}
                value={editingTask.description}
                onChange={e => setEditingTask({ ...editingTask, description: e.target.value })}
                rows={4}
              />
              <label className={styles.fieldLabel}>Priority</label>
              <select
                className={styles.fieldSelect}
                value={editingTask.priority}
                onChange={e => setEditingTask({ ...editingTask, priority: e.target.value as Task['priority'] })}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.deleteBtn} onClick={() => handleDeleteTask(editingTask.id)}>Delete</button>
              <div className={styles.modalActions}>
                <button className={styles.cancelBtn} onClick={() => setEditingTask(null)}>Cancel</button>
                <button className={styles.saveBtn} onClick={handleSaveEdit}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
