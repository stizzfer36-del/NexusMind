import { useState, useCallback } from 'react'
import type { WorkflowDAG, WorkflowTemplate, WorkflowNode, WorkflowNodeType } from '@nexusmind/shared'

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export function useGraphStore() {
  const [dags, setDags] = useState<WorkflowDAG[]>([])
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [currentDag, setCurrentDag] = useState<WorkflowDAG | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const createBlankDag = useCallback((): WorkflowDAG => {
    const now = Date.now()
    return {
      id: newId(),
      name: 'Untitled Workflow',
      nodes: [
        { id: 'n-start', type: 'start' as WorkflowNodeType, label: 'Start', position: { x: 80, y: 200 } },
        { id: 'n-end', type: 'end' as WorkflowNodeType, label: 'End', position: { x: 520, y: 200 } },
      ],
      edges: [],
      createdAt: now,
      updatedAt: now,
    }
  }, [])

  const createFromTemplate = useCallback((template: WorkflowTemplate): WorkflowDAG => {
    const now = Date.now()
    return { ...template.dag, id: newId(), createdAt: now, updatedAt: now }
  }, [])

  const updateNode = useCallback((nodeId: string, patch: Partial<WorkflowNode>) => {
    setCurrentDag(prev => {
      if (!prev) return prev
      return {
        ...prev,
        nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, ...patch } : n),
      }
    })
  }, [])

  const addNode = useCallback((type: WorkflowNodeType) => {
    setCurrentDag(prev => {
      if (!prev) return prev
      const node: WorkflowNode = {
        id: newId(),
        type,
        label: type.charAt(0).toUpperCase() + type.slice(1),
        position: { x: 120, y: 120 + prev.nodes.length * 80 },
      }
      return { ...prev, nodes: [...prev.nodes, node] }
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
    setSelectedNodeId(id => id === nodeId ? null : id)
  }, [])

  const addEdge = useCallback((source: string, target: string) => {
    setCurrentDag(prev => {
      if (!prev) return prev
      const edge = { id: newId(), source, target }
      return { ...prev, edges: [...prev.edges, edge] }
    })
  }, [])

  const removeEdge = useCallback((edgeId: string) => {
    setCurrentDag(prev => {
      if (!prev) return prev
      return { ...prev, edges: prev.edges.filter(e => e.id !== edgeId) }
    })
  }, [])

  return {
    dags, setDags,
    templates, setTemplates,
    currentDag, setCurrentDag,
    selectedNodeId, setSelectedNodeId,
    loading, setLoading,
    saving, setSaving,
    running, setRunning,
    error, setError,
    createBlankDag,
    createFromTemplate,
    updateNode,
    addNode,
    removeNode,
    addEdge,
    removeEdge,
  }
}
