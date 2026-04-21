import React, { useCallback, useEffect, useState } from 'react'
import { useIPC } from '../../hooks'
import type { WorkflowDAG, WorkflowEdge, WorkflowNode, WorkflowNodeType, WorkflowTemplate } from '@nexusmind/shared'
import styles from './GraphPanel.module.css'

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_W = 160
const NODE_H = 56

const NODE_BORDER_COLORS: Record<WorkflowNodeType, string> = {
  start:     '#22c55e',
  end:       '#ef4444',
  agent:     '#3b82f6',
  tool:      '#f97316',
  condition: '#f59e0b',
}

const AGENT_ROLES = ['coordinator', 'builder', 'reviewer', 'tester', 'docwriter']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

function createBlankDag(): WorkflowDAG {
  const now = Date.now()
  return {
    id: newId(),
    name: 'Untitled Workflow',
    nodes: [
      { id: 'n-start', type: 'start', label: 'Start', position: { x: 80, y: 200 } },
      { id: 'n-end',   type: 'end',   label: 'End',   position: { x: 520, y: 200 } },
    ],
    edges: [],
    createdAt: now,
    updatedAt: now,
  }
}

function cloneFromTemplate(template: WorkflowTemplate): WorkflowDAG {
  const now = Date.now()
  return {
    ...template.dag,
    id: newId(),
    name: template.name,
    createdAt: now,
    updatedAt: now,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GraphPanel() {
  // ── State ────────────────────────────────────────────────────────────────
  const [dags, setDags]                   = useState<WorkflowDAG[]>([])
  const [templates, setTemplates]         = useState<WorkflowTemplate[]>([])
  const [currentDag, setCurrentDag]       = useState<WorkflowDAG | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [saving, setSaving]               = useState(false)
  const [running, setRunning]             = useState(false)
  const [runResult, setRunResult]         = useState<string | null>(null)
  const [connectTarget, setConnectTarget] = useState<string>('')
  const [runInput, setRunInput]           = useState('')

  // Drag state — stored in a plain ref-like object via useState
  const [dragState, setDragState] = useState<{
    nodeId: string
    startMouseX: number
    startMouseY: number
    startNodeX: number
    startNodeY: number
  } | null>(null)

  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})

  // ── IPC instances ────────────────────────────────────────────────────────
  const listIPC      = useIPC<'graph:list'>()
  const templatesIPC = useIPC<'graph:templates'>()
  const saveIPC      = useIPC<'graph:save'>()
  const deleteIPC    = useIPC<'graph:delete'>()
  const executeIPC   = useIPC<'graph:execute'>()

  // ── On mount ─────────────────────────────────────────────────────────────
  useEffect(() => {
    templatesIPC.invoke('graph:templates').then(setTemplates).catch(console.error)
    listIPC.invoke('graph:list').then(setDags).catch(console.error)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync node positions when currentDag changes
  useEffect(() => {
    if (currentDag) {
      const p: Record<string, { x: number; y: number }> = {}
      for (const n of currentDag.nodes) p[n.id] = n.position
      setPositions(p)
    }
  }, [currentDag?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Node mutation helpers ─────────────────────────────────────────────────

  const updateNodePosition = useCallback((nodeId: string, pos: { x: number; y: number }) => {
    setCurrentDag(prev => {
      if (!prev) return prev
      return {
        ...prev,
        nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, position: pos } : n),
      }
    })
  }, [])

  const updateSelectedNode = useCallback((patch: Partial<WorkflowNode>) => {
    setCurrentDag(prev => {
      if (!prev || !selectedNodeId) return prev
      return {
        ...prev,
        nodes: prev.nodes.map(n => n.id === selectedNodeId ? { ...n, ...patch } : n),
      }
    })
  }, [selectedNodeId])

  const addNode = useCallback((type: WorkflowNodeType) => {
    setCurrentDag(prev => {
      if (!prev) return prev
      const count = prev.nodes.length
      const newNode: WorkflowNode = {
        id: newId(),
        type,
        label: type.charAt(0).toUpperCase() + type.slice(1),
        position: { x: 120, y: 120 + count * 80 },
      }
      return { ...prev, nodes: [...prev.nodes, newNode] }
    })
  }, [])

  const removeNode = useCallback((nodeId: string) => {
    setCurrentDag(prev => {
      if (!prev) return prev
      return {
        ...prev,
        nodes: prev.nodes.filter(n => n.id !== nodeId),
        edges: prev.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
      }
    })
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
  }, [selectedNodeId])

  const addEdge = useCallback((source: string, target: string) => {
    setCurrentDag(prev => {
      if (!prev) return prev
      const alreadyExists = prev.edges.some(e => e.source === source && e.target === target)
      if (alreadyExists) return prev
      const newEdge: WorkflowEdge = { id: newId(), source, target }
      return { ...prev, edges: [...prev.edges, newEdge] }
    })
  }, [])

  const removeNodeEdges = useCallback((nodeId: string) => {
    setCurrentDag(prev => {
      if (!prev) return prev
      return {
        ...prev,
        edges: prev.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
      }
    })
  }, [])

  // ── DAG CRUD ──────────────────────────────────────────────────────────────

  async function saveDag() {
    if (!currentDag) return
    setSaving(true)
    const updated = { ...currentDag, updatedAt: Date.now() }
    await saveIPC.invoke('graph:save', updated)
    const list = await listIPC.invoke('graph:list')
    setDags(list)
    setCurrentDag(updated)
    setSaving(false)
  }

  async function deleteDag(id: string) {
    await deleteIPC.invoke('graph:delete', id)
    const list = await listIPC.invoke('graph:list')
    setDags(list)
    if (currentDag?.id === id) {
      setCurrentDag(null)
      setSelectedNodeId(null)
    }
  }

  async function runDag() {
    if (!currentDag) return
    setRunning(true)
    setRunResult(null)
    try {
      const result = await executeIPC.invoke('graph:execute', {
        dagId: currentDag.id,
        input: runInput || undefined,
      })
      setRunResult(`Run started: ${result.runId}`)
    } catch (err) {
      setRunResult(`Error: ${String(err)}`)
    }
    setRunning(false)
  }

  // ── Canvas drag handlers ──────────────────────────────────────────────────

  function onNodeMouseDown(nodeId: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const pos = positions[nodeId] ?? { x: 0, y: 0 }
    setDragState({
      nodeId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startNodeX: pos.x,
      startNodeY: pos.y,
    })
  }

  function onCanvasMouseMove(e: React.MouseEvent) {
    if (!dragState) return
    setPositions(prev => ({
      ...prev,
      [dragState.nodeId]: {
        x: dragState.startNodeX + (e.clientX - dragState.startMouseX),
        y: dragState.startNodeY + (e.clientY - dragState.startMouseY),
      },
    }))
  }

  function onCanvasMouseUp() {
    if (dragState) {
      const newPos = positions[dragState.nodeId]
      if (newPos) updateNodePosition(dragState.nodeId, newPos)
    }
    setDragState(null)
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const selectedNode = currentDag?.nodes.find(n => n.id === selectedNodeId) ?? null

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.root}>
      {/* ── Left Sidebar ────────────────────────────────────────────────── */}
      <div className={styles.leftPanel}>

        {/* Templates */}
        <div className={styles.sectionTitle}>Templates</div>
        {templates.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--color-muted)', padding: '4px 0' }}>No templates</div>
        ) : (
          templates.map(tpl => (
            <button
              key={tpl.id}
              className={styles.templateItem}
              onClick={() => {
                const dag = cloneFromTemplate(tpl)
                setCurrentDag(dag)
                setSelectedNodeId(null)
                setRunResult(null)
              }}
              title={tpl.description}
            >
              <div style={{ fontWeight: 500, fontSize: 12, color: 'var(--color-text)' }}>{tpl.name}</div>
              {tpl.description && (
                <div style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2 }}>{tpl.description}</div>
              )}
            </button>
          ))
        )}

        <div className={styles.divider} />

        {/* Add Node Palette */}
        <div className={styles.sectionTitle}>Add Node</div>
        <div className={styles.paletteRow}>
          {(['start', 'end', 'agent', 'tool', 'condition'] as WorkflowNodeType[]).map(type => (
            <button
              key={type}
              className={styles.paletteBtn}
              style={{ borderLeftColor: NODE_BORDER_COLORS[type] }}
              onClick={() => { if (currentDag) addNode(type) }}
              disabled={!currentDag}
              title={currentDag ? `Add ${type} node` : 'Open or create a workflow first'}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>

        <div className={styles.divider} />

        {/* Saved Workflows */}
        <div className={styles.sectionTitle}>Saved Workflows</div>
        <button
          className={styles.newBtn}
          onClick={() => {
            setCurrentDag(createBlankDag())
            setSelectedNodeId(null)
            setRunResult(null)
          }}
        >
          + New Blank
        </button>
        {dags.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--color-muted)', padding: '4px 0' }}>No saved workflows</div>
        ) : (
          dags.map(dag => (
            <div key={dag.id} className={styles.dagItem}>
              <button
                className={styles.dagItemName}
                onClick={() => {
                  setCurrentDag(dag)
                  setSelectedNodeId(null)
                  setRunResult(null)
                }}
                style={currentDag?.id === dag.id
                  ? { color: 'var(--color-accent)', fontWeight: 600 }
                  : undefined
                }
                title={dag.description}
              >
                {dag.name}
              </button>
              <button
                className={styles.deleteBtn}
                onClick={() => deleteDag(dag.id)}
                title="Delete workflow"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      {/* ── Canvas ──────────────────────────────────────────────────────── */}
      <div
        className={styles.canvas}
        style={{ cursor: dragState ? 'grabbing' : 'default' }}
        onMouseMove={onCanvasMouseMove}
        onMouseUp={onCanvasMouseUp}
        onMouseLeave={onCanvasMouseUp}
        onClick={() => setSelectedNodeId(null)}
      >
        {!currentDag ? (
          <div className={styles.emptyState}>
            <div>Select or create a workflow to begin</div>
          </div>
        ) : (
          <>
            {/* SVG layer for edges */}
            <svg
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                overflow: 'visible',
              }}
            >
              <defs>
                <marker
                  id="graph-arrow"
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0,0 L0,6 L8,3 z" fill="var(--color-border, rgba(255,255,255,0.25))" />
                </marker>
              </defs>
              {currentDag.edges.map(edge => {
                const srcPos = positions[edge.source]
                const tgtPos = positions[edge.target]
                if (!srcPos || !tgtPos) return null
                const x1 = srcPos.x + NODE_W / 2
                const y1 = srcPos.y + NODE_H / 2
                const x2 = tgtPos.x + NODE_W / 2
                const y2 = tgtPos.y + NODE_H / 2
                const mx = (x1 + x2) / 2
                const my = (y1 + y2) / 2
                return (
                  <g key={edge.id}>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="var(--color-border, rgba(255,255,255,0.25))"
                      strokeWidth={1.5}
                      markerEnd="url(#graph-arrow)"
                    />
                    {(edge.label || edge.condition) && (
                      <text
                        x={mx}
                        y={my - 4}
                        textAnchor="middle"
                        fontSize="10"
                        fill="var(--color-muted, rgba(255,255,255,0.4))"
                      >
                        {edge.label ?? edge.condition}
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>

            {/* Node divs */}
            {currentDag.nodes.map(node => {
              const pos = positions[node.id] ?? node.position
              const isSelected = selectedNodeId === node.id
              return (
                <div
                  key={node.id}
                  className={`${styles.node} ${isSelected ? styles.nodeSelected : ''}`}
                  style={{
                    left: pos.x,
                    top: pos.y,
                    borderLeft: `3px solid ${NODE_BORDER_COLORS[node.type]}`,
                  }}
                  onMouseDown={e => onNodeMouseDown(node.id, e)}
                  onClick={e => { e.stopPropagation(); setSelectedNodeId(node.id) }}
                >
                  <span className={styles.nodeLabel}>{node.label}</span>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* ── Right Inspector Panel ────────────────────────────────────────── */}
      <div className={styles.rightPanel}>
        {!currentDag ? (
          <div className={styles.emptyState}>
            Select or create a workflow to begin
          </div>
        ) : selectedNode ? (
          /* Node inspector */
          <>
            <div className={styles.sectionTitle}>Node</div>

            <div>
              <div className={styles.fieldLabel}>Label</div>
              <input
                className={styles.input}
                value={selectedNode.label}
                onChange={e => updateSelectedNode({ label: e.target.value })}
              />
            </div>

            <div>
              <div className={styles.fieldLabel}>Type</div>
              <select
                className={styles.select}
                value={selectedNode.type}
                onChange={e => updateSelectedNode({ type: e.target.value as WorkflowNodeType })}
              >
                {(['start', 'end', 'agent', 'tool', 'condition'] as WorkflowNodeType[]).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Type-specific config */}
            {selectedNode.type === 'agent' && (
              <div>
                <div className={styles.fieldLabel}>Role</div>
                <select
                  className={styles.select}
                  value={String(selectedNode.config?.role ?? 'coordinator')}
                  onChange={e => updateSelectedNode({ config: { ...selectedNode.config, role: e.target.value } })}
                >
                  {AGENT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}

            {selectedNode.type === 'tool' && (
              <div>
                <div className={styles.fieldLabel}>Tool Name</div>
                <input
                  className={styles.input}
                  value={String(selectedNode.config?.toolName ?? '')}
                  placeholder="e.g. read_file"
                  onChange={e => updateSelectedNode({ config: { ...selectedNode.config, toolName: e.target.value } })}
                />
              </div>
            )}

            {selectedNode.type === 'condition' && (
              <div>
                <div className={styles.fieldLabel}>Condition</div>
                <textarea
                  className={styles.textarea}
                  value={String(selectedNode.config?.condition ?? '')}
                  placeholder="e.g. state.approved === true"
                  onChange={e => updateSelectedNode({ config: { ...selectedNode.config, condition: e.target.value } })}
                />
              </div>
            )}

            <div className={styles.divider} />

            {/* Connect to */}
            <div className={styles.sectionTitle}>Edges</div>
            <div>
              <div className={styles.fieldLabel}>Connect to...</div>
              <select
                className={styles.select}
                value={connectTarget}
                onChange={e => setConnectTarget(e.target.value)}
              >
                <option value="">— select target —</option>
                {currentDag.nodes
                  .filter(n => n.id !== selectedNode.id)
                  .map(n => (
                    <option key={n.id} value={n.id}>{n.label} ({n.type})</option>
                  ))
                }
              </select>
            </div>
            <button
              className={styles.saveBtn}
              disabled={!connectTarget}
              onClick={() => {
                if (connectTarget) {
                  addEdge(selectedNode.id, connectTarget)
                  setConnectTarget('')
                }
              }}
            >
              Add Edge
            </button>
            <button
              className={styles.saveBtn}
              style={{ borderColor: 'var(--color-muted)', color: 'var(--color-muted)' }}
              onClick={() => removeNodeEdges(selectedNode.id)}
            >
              Remove Selected Edges
            </button>

            <div className={styles.divider} />

            <button
              className={styles.deleteNodeBtn}
              onClick={() => removeNode(selectedNode.id)}
            >
              Delete Node
            </button>
          </>
        ) : (
          /* DAG inspector */
          <>
            <div className={styles.sectionTitle}>Workflow</div>

            <div>
              <div className={styles.fieldLabel}>Name</div>
              <input
                className={styles.input}
                value={currentDag.name}
                onChange={e => setCurrentDag(prev => prev ? { ...prev, name: e.target.value } : prev)}
              />
            </div>

            <div>
              <div className={styles.fieldLabel}>Description</div>
              <textarea
                className={styles.textarea}
                value={currentDag.description ?? ''}
                placeholder="Optional description..."
                onChange={e => setCurrentDag(prev => prev ? { ...prev, description: e.target.value } : prev)}
              />
            </div>

            <div>
              <div className={styles.fieldLabel}>Run input</div>
              <textarea
                className={styles.textarea}
                value={runInput}
                placeholder="Input for this run..."
                onChange={e => setRunInput(e.target.value)}
              />
            </div>

            <button
              className={styles.saveBtn}
              disabled={saving}
              onClick={saveDag}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>

            <button
              className={styles.runBtn}
              disabled={running}
              onClick={runDag}
            >
              {running ? 'Running...' : 'Run'}
            </button>

            {runResult && (
              <div className={styles.runResult}>{runResult}</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
