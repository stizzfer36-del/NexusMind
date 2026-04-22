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
  const [newTaskDescription, setNewTaskDescription] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState<Task['priority']>('medium')
  const [newTaskTags, setNewTaskTags] = useState('')
  const [dragOverColumn, setDragOverColumn] = useState<ColumnId | null>(null)
  const dragTaskRef = useRef<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const listIPC = useIPC<'kanban:getTasks'>()
  const createIPC = useIPC<'kanban:createTask'>()
  const updateIPC = useIPC<'kanban:updateTask'>()
  const deleteIPC = useIPC<'kanban:deleteTask'>()
  const moveIPC = useIPC<'kanban:moveTask'>()

  // Load tasks
  useEffect(() => {
    setLoading(true)
    listIPC.invoke('kanban:getTasks')
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
    const tags = newTaskTags.split(',').map(t => t.trim()).filter(Boolean)
    try {
      const result = await createIPC.invoke('kanban:createTask', {
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim(),
        status: 'todo' as any,
        column: col as any,
        subtasks: [],
        tags,
        priority: newTaskPriority,
      })
      if (result && 'id' in result) {
        setTasks(prev => [...prev, result as Task])
      }
      setNewTaskTitle('')
      setNewTaskDescription('')
      setNewTaskPriority('medium')
      setNewTaskTags('')
      setAddingToColumn(null)
    } catch (err) {
      console.error('Failed to create task:', err)
    }
  }, [createIPC, newTaskTitle, newTaskDescription, newTaskPriority, newTaskTags])

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
                      setNewTaskDescription('')
                      setNewTaskPriority('medium')
                      setNewTaskTags('')
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
                    <textarea
                      className={styles.addTextarea}
                      placeholder="Description (optional)"
                      value={newTaskDescription}
                      onChange={e => setNewTaskDescription(e.target.value)}
                      rows={2}
                    />
                    <div className={styles.addRow}>
                      <select
                        className={styles.addSelect}
                        value={newTaskPriority}
                        onChange={e => setNewTaskPriority(e.target.value as Task['priority'])}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                      <input
                        className={styles.addInput}
                        placeholder="Tags (comma separated)"
                        value={newTaskTags}
                        onChange={e => setNewTaskTags(e.target.value)}
                      />
                    </div>
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
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          setEditingTask(task)
                        }
                        if (e.key === 'Delete') {
                          e.preventDefault()
                          if (confirm('Delete this task?')) {
                            handleDeleteTask(task.id)
                          }
                        }
                      }}
                      tabIndex={0}
                      role="article"
                      aria-label={`Task: ${task.title}. Priority ${task.priority}. Press Enter to edit, Delete to remove.`}
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

      {/* Edit drawer */}
      {editingTask && (
        <div className={styles.drawerOverlay} onClick={() => setEditingTask(null)}>
          <div className={styles.drawer} onClick={e => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <h3 className={styles.drawerTitle}>Task Detail</h3>
              <button className={styles.drawerClose} onClick={() => setEditingTask(null)}>×</button>
            </div>
            <div className={styles.drawerBody}>
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
              <label className={styles.fieldLabel}>Status</label>
              <select
                className={styles.fieldSelect}
                value={editingTask.status}
                onChange={e => setEditingTask({ ...editingTask, status: e.target.value as Task['status'] })}
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="in_review">In Review</option>
                <option value="done">Done</option>
                <option value="archived">Archived</option>
              </select>
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
              <label className={styles.fieldLabel}>Created</label>
              <div className={styles.readOnly}>
                {new Date(editingTask.createdAt).toLocaleString()}
              </div>
            </div>
            <div className={styles.drawerFooter}>
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
