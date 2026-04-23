import React, { useState, useCallback, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { InlineChat } from '../../components/InlineChat'
import styles from './EditorPanel.module.css'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  isOpen?: boolean
}

interface OpenFile {
  path: string
  content: string
  language: string
  isModified: boolean
}

export function EditorPanel(): React.ReactElement {
  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
  const [workspacePath, setWorkspacePath] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const editorRef = useRef<any>(null)

  useEffect(() => {
    loadWorkspace()
  }, [])

  const loadWorkspace = async () => {
    try {
      const path = await window.electronAPI.invoke('settings:get', 'workspacePath')
      if (path) {
        setWorkspacePath(path)
        await loadFileTree(path)
      }
    } catch (err) {
      console.error('Failed to load workspace:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const loadFileTree = async (path: string) => {
    try {
      const result = await window.electronAPI.invoke('file:list', path)
      if (result.success) {
        const tree = buildFileTree(result.files, path)
        setFileTree(tree)
      }
    } catch (err) {
      console.error('Failed to load file tree:', err)
    }
  }

  const buildFileTree = (files: string[], basePath: string): FileNode[] => {
    const root: FileNode[] = []
    const directories = new Map<string, FileNode>()

    files.forEach(file => {
      const relativePath = file.replace(basePath, '').replace(/^\//, '')
      const parts = relativePath.split('/').filter(Boolean)
      
      if (parts.length === 0) return

      let current = root
      let currentPath = basePath

      parts.forEach((part, index) => {
        currentPath = `${currentPath}/${part}`
        const isLast = index === parts.length - 1
        
        if (isLast) {
          current.push({
            name: part,
            path: currentPath,
            type: 'file'
          })
        } else {
          if (!directories.has(currentPath)) {
            const dir: FileNode = {
              name: part,
              path: currentPath,
              type: 'directory',
              children: [],
              isOpen: false
            }
            directories.set(currentPath, dir)
            current.push(dir)
            current = dir.children!
          } else {
            current = directories.get(currentPath)!.children!
          }
        }
      })
    })

    return sortFileTree(root)
  }

  const sortFileTree = (nodes: FileNode[]): FileNode[] => {
    return nodes.sort((a, b) => {
      if (a.type === 'directory' && b.type === 'file') return -1
      if (a.type === 'file' && b.type === 'directory') return 1
      return a.name.localeCompare(b.name)
    }).map(node => {
      if (node.children) {
        return { ...node, children: sortFileTree(node.children) }
      }
      return node
    })
  }

  const openFile = useCallback(async (path: string) => {
    const existing = openFiles.find(f => f.path === path)
    if (existing) {
      setActiveFilePath(path)
      return
    }

    try {
      const result = await window.electronAPI.invoke('file:read', path)
      if (result.success) {
        const newFile: OpenFile = {
          path,
          content: result.content,
          language: getLanguageFromPath(path),
          isModified: false
        }
        setOpenFiles(prev => [...prev, newFile])
        setActiveFilePath(path)
      }
    } catch (err) {
      console.error('Failed to open file:', err)
    }
  }, [openFiles])

  const closeFile = useCallback((path: string, event?: React.MouseEvent) => {
    event?.stopPropagation()
    
    setOpenFiles(prev => {
      const index = prev.findIndex(f => f.path === path)
      const newFiles = prev.filter(f => f.path !== path)

      if (activeFilePath === path && newFiles.length > 0) {
        const newIndex = Math.min(index, newFiles.length - 1)
        setActiveFilePath(newFiles[newIndex].path)
      } else if (newFiles.length === 0) {
        setActiveFilePath(null)
      }
      
      return newFiles
    })
  }, [activeFilePath])

  const saveFile = useCallback(async () => {
    if (!activeFilePath || !editorRef.current) return
    
    const content = editorRef.current.getValue()
    
    try {
      await window.electronAPI.invoke('file:write', activeFilePath, content)
      
      setOpenFiles(prev => prev.map(f => 
        f.path === activeFilePath ? { ...f, isModified: false } : f
      ))
    } catch (err) {
      console.error('Failed to save file:', err)
    }
  }, [activeFilePath])

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!activeFilePath || value === undefined) return
    
    setOpenFiles(prev => prev.map(f => 
      f.path === activeFilePath ? { ...f, content: value, isModified: true } : f
    ))
  }, [activeFilePath])

  const toggleDirectory = useCallback((path: string) => {
    setFileTree(prev => toggleNode(prev, path))
  }, [])

  const toggleNode = (nodes: FileNode[], targetPath: string): FileNode[] => {
    return nodes.map(node => {
      if (node.path === targetPath && node.type === 'directory') {
        return { ...node, isOpen: !node.isOpen }
      }
      if (node.children) {
        return { ...node, children: toggleNode(node.children, targetPath) }
      }
      return node
    })
  }

  const getLanguageFromPath = (path: string): string => {
    const ext = path.split('.').pop()?.toLowerCase()
    const langMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'json': 'json',
      'md': 'markdown',
      'css': 'css',
      'html': 'html',
      'py': 'python',
      'rs': 'rust',
      'go': 'go',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'sql': 'sql',
      'yaml': 'yaml',
      'yml': 'yaml',
    }
    return langMap[ext || ''] || 'plaintext'
  }

  const getFileName = (path: string): string => {
    return path.split('/').pop() || path
  }

  const activeFile = openFiles.find(f => f.path === activeFilePath)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        saveFile()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [saveFile])

  if (isLoading) {
    return <div className={styles.loading}>Loading workspace...</div>
  }

  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span>Explorer</span>
          <button 
            className={styles.refreshBtn}
            onClick={() => workspacePath && loadFileTree(workspacePath)}
            title="Refresh"
          >
            ↻
          </button>
        </div>
        <div className={styles.fileTree}>
          {workspacePath && (
            <div className={styles.workspaceName}>
              {workspacePath.split('/').pop()}
            </div>
          )}
          <FileTreeNodes 
            nodes={fileTree} 
            onFileClick={openFile}
            onDirectoryClick={toggleDirectory}
            activeFilePath={activeFilePath}
          />
        </div>
      </div>

      <div className={styles.main}>
        {openFiles.length > 0 && (
          <div className={styles.tabs}>
            {openFiles.map(file => (
              <div
                key={file.path}
                className={`${styles.tab} ${file.path === activeFilePath ? styles.active : ''} ${file.isModified ? styles.modified : ''}`}
                onClick={() => setActiveFilePath(file.path)}
              >
                <span className={styles.tabName}>{getFileName(file.path)}</span>
                {file.isModified && <span className={styles.modifiedIndicator}>●</span>}
                <button 
                  className={styles.closeBtn}
                  onClick={(e) => closeFile(file.path, e)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={styles.editorContainer}>
          {activeFile && (
            <InlineChat 
              editorRef={editorRef}
              filePath={activeFilePath}
              onClose={() => {}}
            />
          )}
          {activeFile ? (
            <Editor
              height="100%"
              language={activeFile.language}
              value={activeFile.content}
              theme="vs-dark"
              onChange={handleEditorChange}
              onMount={(editor) => { editorRef.current = editor }}
              options={{
                minimap: { enabled: true },
                fontSize: 14,
                wordWrap: 'on',
                automaticLayout: true,
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                renderWhitespace: 'selection',
                bracketPairColorization: { enabled: true },
              }}
            />
          ) : (
            <div className={styles.welcome}>
              <h3>NexusMind Code Editor</h3>
              <p>Select a file from the explorer to start editing</p>
              <div className={styles.shortcuts}>
                <div><kbd>Cmd/Ctrl</kbd> + <kbd>S</kbd> Save file</div>
                <div><kbd>Cmd/Ctrl</kbd> + <kbd>P</kbd> Quick open</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface FileTreeNodesProps {
  nodes: FileNode[]
  onFileClick: (path: string) => void
  onDirectoryClick: (path: string) => void
  activeFilePath: string | null
  depth?: number
}

function FileTreeNodes({ nodes, onFileClick, onDirectoryClick, activeFilePath, depth = 0 }: FileTreeNodesProps): React.ReactElement {
  return (
    <>
      {nodes.map(node => (
        <div key={node.path}>
          <div
            className={`${styles.fileNode} ${node.type === 'directory' ? styles.directory : styles.file} ${node.path === activeFilePath ? styles.active : ''}`}
            style={{ paddingLeft: `${(depth * 12) + 8}px` }}
            onClick={() => node.type === 'file' ? onFileClick(node.path) : onDirectoryClick(node.path)}
          >
            <span className={styles.icon}>
              {node.type === 'directory' ? (node.isOpen ? '📂' : '📁') : getFileIcon(node.name)}
            </span>
            <span className={styles.name}>{node.name}</span>
          </div>
          {node.type === 'directory' && node.isOpen && node.children && (
            <FileTreeNodes 
              nodes={node.children}
              onFileClick={onFileClick}
              onDirectoryClick={onDirectoryClick}
              activeFilePath={activeFilePath}
              depth={depth + 1}
            />
          )}
        </div>
      ))}
    </>
  )
}

function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const icons: Record<string, string> = {
    'ts': '📘',
    'tsx': '⚛️',
    'js': '📒',
    'jsx': '⚛️',
    'json': '📋',
    'md': '📝',
    'css': '🎨',
    'html': '🌐',
    'py': '🐍',
    'rs': '🦀',
    'go': '🐹',
    'java': '☕',
    'sql': '🗃️',
  }
  return icons[ext || ''] || '📄'
}
