import React, { useState, useEffect, useCallback } from 'react'
import styles from './SearchPanel.module.css'

interface SearchResult {
  file: {
    id: string
    path: string
    content: string
    language: string
    lastModified: number
    indexedAt: number
  }
  similarity: number
}

interface IndexStats {
  totalFiles: number
  languages: Record<string, number>
  lastIndexed: number | null
}

export function SearchPanel(): React.ReactElement {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isIndexing, setIsIndexing] = useState(false)
  const [stats, setStats] = useState<IndexStats | null>(null)
  const [selectedFile, setSelectedFile] = useState<SearchResult | null>(null)

  useEffect(() => {
    loadStats()
    const interval = setInterval(loadStats, 5000)
    return () => clearInterval(interval)
  }, [])

  const loadStats = async () => {
    try {
      const statsResult = await window.electronAPI.invoke('codebase:stats')
      setStats(statsResult)
    } catch (err) {
      console.error('Failed to load stats:', err)
    }
  }

  const handleSearch = useCallback(async () => {
    if (!query.trim()) {
      setResults([])
      return
    }

    setIsSearching(true)
    try {
      const searchResults = await window.electronAPI.invoke('codebase:search', query, 20)
      setResults(searchResults)
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setIsSearching(false)
    }
  }, [query])

  const handleIndex = async () => {
    setIsIndexing(true)
    try {
      await window.electronAPI.invoke('codebase:index')
      await loadStats()
    } catch (err) {
      console.error('Indexing failed:', err)
    } finally {
      setIsIndexing(false)
    }
  }

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString()
  }

  const getLanguageIcon = (lang: string): string => {
    const icons: Record<string, string> = {
      typescript: '📘',
      javascript: '📒',
      python: '🐍',
      rust: '🦀',
      go: '🐹',
      java: '☕',
    }
    return icons[lang] || '📄'
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2>Semantic Code Search</h2>
          <p className={styles.subtitle}>Find code by meaning, not just keywords</p>
        </div>
        <button 
          className={styles.indexBtn}
          onClick={handleIndex}
          disabled={isIndexing}
        >
          {isIndexing ? 'Indexing...' : 'Re-index Codebase'}
        </button>
      </div>

      {stats && (
        <div className={styles.stats}>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{stats.totalFiles}</span>
            <span className={styles.statLabel}>files indexed</span>
          </div>
          {Object.entries(stats.languages).map(([lang, count]) => (
            <div key={lang} className={styles.statCard}>
              <span className={styles.statValue}>{count}</span>
              <span className={styles.statLabel}>{lang}</span>
            </div>
          ))}
          {stats.lastIndexed && (
            <div className={styles.statCard}>
              <span className={styles.statValue}>
                {new Date(stats.lastIndexed).toLocaleDateString()}
              </span>
              <span className={styles.statLabel}>last indexed</span>
            </div>
          )}
        </div>
      )}

      <div className={styles.searchBox}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search by meaning: 'authentication middleware', 'database connection', etc."
          className={styles.searchInput}
        />
        <button 
          className={styles.searchBtn}
          onClick={handleSearch}
          disabled={isSearching || !query.trim()}
        >
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </div>

      <div className={styles.results}>
        {results.length === 0 && !isSearching && query && (
          <div className={styles.empty}>No results found</div>
        )}

        {results.length === 0 && !query && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🔍</div>
            <div>Search your codebase by meaning</div>
            <div className={styles.examples}>
              Try: "authentication logic", "database models", "error handling"
            </div>
          </div>
        )}

        <div className={styles.resultList}>
          {results.map((result, idx) => (
            <div
              key={result.file.id}
              className={styles.resultItem}
              onClick={() => setSelectedFile(result)}
            >
              <div className={styles.resultHeader}>
                <span className={styles.languageIcon}>{getLanguageIcon(result.file.language)}</span>
                <span className={styles.filePath}>{result.file.path}</span>
                <span className={styles.similarity}>{(result.similarity * 100).toFixed(0)}% match</span>
              </div>
              <div className={styles.preview}>
                {result.file.content.slice(0, 150).replace(/\n/g, ' ')}...
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedFile && (
        <div className={styles.modal} onClick={() => setSelectedFile(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>{selectedFile.file.path}</h3>
              <button onClick={() => setSelectedFile(null)}>×</button>
            </div>
            <div className={styles.fileInfo}>
              <span>Language: {selectedFile.file.language}</span>
              <span>Match: {(selectedFile.similarity * 100).toFixed(1)}%</span>
              <span>Modified: {formatDate(selectedFile.file.lastModified)}</span>
            </div>
            <pre className={styles.codeBlock}>{selectedFile.file.content}</pre>
          </div>
        </div>
      )}

      <div className={styles.contextRotBanner}>
        <div className={styles.bannerIcon}>🧠</div>
        <div className={styles.bannerContent}>
          <h4>Solving the "Context Rot" Problem</h4>
          <p>
            Unlike Cursor, which forgets your codebase every session, NexusMind indexes everything 
            and uses semantic search to find the right files automatically. No more manually 
            adding @-mentions to give AI context.
          </p>
        </div>
      </div>
    </div>
  )
}
