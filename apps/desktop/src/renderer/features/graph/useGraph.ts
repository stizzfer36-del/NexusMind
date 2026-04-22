import { useEffect } from 'react'
import { useIPC } from '../../hooks'
import { useGraphStore } from '../../stores/graph.store'

export function useGraph() {
  const store = useGraphStore()

  const listIPC = useIPC<'graph:list'>()
  const templatesIPC = useIPC<'graph:templates'>()
  const saveIPC = useIPC<'graph:save'>()
  const deleteIPC = useIPC<'graph:delete'>()
  const executeIPC = useIPC<'graph:execute'>()

  useEffect(() => {
    store.setLoading(true)
    Promise.all([
      listIPC.invoke('graph:list'),
      templatesIPC.invoke('graph:templates'),
    ])
      .then(([dags, templates]) => {
        if (Array.isArray(dags)) store.setDags(dags)
        if (Array.isArray(templates)) store.setTemplates(templates)
      })
      .catch(err => store.setError(String(err)))
      .finally(() => store.setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadDags = async () => {
    const dags = await listIPC.invoke('graph:list')
    if (Array.isArray(dags)) store.setDags(dags)
  }

  const selectDag = (id: string) => {
    const dag = store.dags.find(d => d.id === id) ?? null
    store.setCurrentDag(dag)
    store.setSelectedNodeId(null)
  }

  const createBlankDag = () => {
    const dag = store.createBlankDag()
    store.setCurrentDag(dag)
    store.setSelectedNodeId(null)
  }

  const createFromTemplate = (templateId: string) => {
    const tpl = store.templates.find(t => t.id === templateId)
    if (!tpl) return
    const dag = store.createFromTemplate(tpl)
    store.setCurrentDag(dag)
    store.setSelectedNodeId(null)
  }

  const saveCurrentDag = async () => {
    if (!store.currentDag) return
    store.setSaving(true)
    store.setError(undefined)
    try {
      const updated = { ...store.currentDag, updatedAt: Date.now() }
      await saveIPC.invoke('graph:save', updated)
      store.setCurrentDag(updated)
      await loadDags()
    } catch (err) {
      store.setError(String(err))
    } finally {
      store.setSaving(false)
    }
  }

  const deleteDag = async (id: string) => {
    await deleteIPC.invoke('graph:delete', id)
    if (store.currentDag?.id === id) store.setCurrentDag(null)
    await loadDags()
  }

  const runCurrentDag = async (input?: string): Promise<{ runId: string } | null> => {
    if (!store.currentDag) return null
    store.setRunning(true)
    store.setError(undefined)
    try {
      const result = await executeIPC.invoke('graph:execute', {
        dagId: store.currentDag.id,
        input,
      })
      return result
    } catch (err) {
      store.setError(String(err))
      return null
    } finally {
      store.setRunning(false)
    }
  }

  return {
    ...store,
    loadDags,
    selectDag,
    createBlankDag,
    createFromTemplate,
    saveCurrentDag,
    deleteDag,
    runCurrentDag,
    selectedNode: store.currentDag?.nodes.find(n => n.id === store.selectedNodeId) ?? null,
  }
}
