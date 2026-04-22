import { useCallback, useEffect, useRef } from 'react'
import { useIPC } from '../../hooks'
import { useMemoryStore } from '../../stores/memory.store'
import type { MemoryType } from '@nexusmind/shared'

export function useMemory() {
  const store = useMemoryStore()
  const listIPC = useIPC<'memory:list'>()
  const searchIPC = useIPC<'memory:search'>()
  const deleteIPC = useIPC<'memory:delete'>()
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load entries on mount via memory:list -> MemoryService.listMemories()
  useEffect(() => {
    store.setIsLoading(true)
    listIPC
      .invoke('memory:list')
      .then((res) => {
        if (Array.isArray(res)) store.setEntries(res)
      })
      .catch((err) => store.setLastError(String(err)))
      .finally(() => store.setIsLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const doSearch = useCallback(
    (q: string, type: MemoryType | 'all') => {
      const payload = type === 'all' ? { query: q } : { query: q, type }
      searchIPC
        .invoke('memory:search', payload)
        .then((res) => {
          if (Array.isArray(res)) store.setSearchResults(res)
        })
        .catch((err) => store.setLastError(String(err)))
    },
    [searchIPC, store]
  )

  const setQuery = useCallback(
    (q: string) => {
      store.setQuery(q)
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
      searchDebounceRef.current = setTimeout(() => {
        doSearch(q, store.typeFilter)
      }, 300)
    },
    [doSearch, store]
  )

  const setTypeFilter = useCallback(
    (type: MemoryType | 'all') => {
      store.setTypeFilter(type)
      doSearch(store.query, type)
    },
    [doSearch, store]
  )

  const deleteEntry = useCallback(
    async (id: string) => {
      try {
        await deleteIPC.invoke('memory:delete', id)
        const current = useMemoryStore.getState()
        store.setEntries(current.entries.filter((e) => e.id !== id))
        store.setSearchResults(current.searchResults.filter((r) => r.entry.id !== id))
      } catch (err) {
        store.setLastError(String(err))
      }
    },
    [deleteIPC, store]
  )

  const reloadEntries = useCallback(async () => {
    const entries = await listIPC.invoke('memory:list')
    if (Array.isArray(entries)) store.setEntries(entries)
  }, [listIPC, store])

  // Show search results when query or type filter is active;
  // otherwise show all entries from listMemories() as full-match results.
  const results =
    store.query || store.typeFilter !== 'all'
      ? store.searchResults
      : store.entries.map((entry) => ({ entry, similarity: 1 }))

  return {
    ...store,
    results,
    doSearch,
    setQuery,
    setTypeFilter,
    deleteEntry,
    reloadEntries,
    isLoading: listIPC.loading || searchIPC.loading,
  }
}
