export enum MemoryType {
  EPISODIC = 'episodic',
  SEMANTIC = 'semantic',
  PROCEDURAL = 'procedural',
  WORKING = 'working'
}

export interface MemoryEntry {
  id: string
  type: MemoryType
  content: string
  embedding?: number[]
  agentId?: string
  taskId?: string
  tags: string[]
  importance: number
  createdAt: number
  accessedAt: number
}

export interface MemorySearchResult {
  entry: MemoryEntry
  similarity: number
}
