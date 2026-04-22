import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'

vi.mock('electron', () => ({
  BrowserWindow: class MockBrowserWindow {
    static getAllWindows() {
      return []
    }
    on() {
      return this
    }
    once() {
      return this
    }
    isDestroyed() {
      return false
    }
    close() {}
    webContents = { send: vi.fn() }
  },
  app: {
    getPath: () => '/tmp/test-data',
    getAppPath: () => '/tmp/test-app',
  },
}))

import { SwarmService } from './SwarmService.js'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import { SwarmStatus } from '@nexusmind/shared'

// ---------------------------------------------------------------------------
// Mocks for external dependencies (registered via ServiceRegistry)
// ---------------------------------------------------------------------------

class MockKanbanService {
  tasks: any[] = []
  assignments: Array<{ taskId: string; agentId: string }> = []
  updates: Array<{ taskId: string; updates: any }> = []

  getNextTask(_role: string) {
    const task = this.tasks.find((t) => !t.assignee)
    return task ? { ...task } : null
  }

  assignToAgent(taskId: string, agentId: string) {
    this.assignments.push({ taskId, agentId })
    const task = this.tasks.find((t) => t.id === taskId)
    if (task) task.assignee = agentId
  }

  updateTask(id: string, updates: any) {
    this.updates.push({ taskId: id, updates })
    const task = this.tasks.find((t) => t.id === id)
    if (task) Object.assign(task, updates)
    return task
  }

  bulkCreate(tasks: any[]) {
    const created = tasks.map((t) => ({ id: crypto.randomUUID(), ...t }))
    this.tasks.push(...created)
    return created
  }
}

class MockModelRouter {
  response = 'All good'
  delayMs = 0

  async *route(_config: any, _messages: any[]) {
    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs))
    }
    yield {
      id: '1',
      modelId: 'test',
      content: this.response,
      index: 0,
      isDone: true,
    }
  }
}

class MockMemoryService {
  entries: any[] = []
  store(entry: any) {
    this.entries.push(entry)
  }
}

class MockEventRecorder {
  events: any[] = []
  record(e: any) {
    this.events.push(e)
  }
  startSession() {}
  endSession() {}
}

class MockMCPService {
  async executeTool() {
    return { result: 'ok' }
  }
}

class MockLinkService {
  broadcasts: any[] = []
  broadcast(e: any) {
    this.broadcasts.push(e)
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SwarmService', () => {
  let registry: ServiceRegistry
  let swarmService: SwarmService
  let kanban: MockKanbanService
  let modelRouter: MockModelRouter
  let memory: MockMemoryService
  let eventRecorder: MockEventRecorder
  let mcp: MockMCPService
  let link: MockLinkService

  beforeEach(() => {
    registry = ServiceRegistry.getInstance()
    registry.clear()

    kanban = new MockKanbanService()
    modelRouter = new MockModelRouter()
    memory = new MockMemoryService()
    eventRecorder = new MockEventRecorder()
    mcp = new MockMCPService()
    link = new MockLinkService()

    registry.register(SERVICE_TOKENS.KanbanService, kanban)
    registry.register(SERVICE_TOKENS.ModelRouter, modelRouter)
    registry.register(SERVICE_TOKENS.MemoryService, memory)
    registry.register(SERVICE_TOKENS.EventRecorder, eventRecorder)
    registry.register(SERVICE_TOKENS.MCPService, mcp)
    registry.register(SERVICE_TOKENS.LinkService, link)

    swarmService = new SwarmService()
    swarmService.init()
  })

  afterEach(() => {
    registry.clear()
  })

  it('task dispatch happy path', async () => {
    const config = {
      maxAgents: 5,
      maxRounds: 3,
      consensusThreshold: 0.8,
      timeoutMs: 5000,
      enableReflection: false,
    }
    const session = swarmService.createSession(config, 'Test Happy Path')

    kanban.bulkCreate([
      { title: 'Task 1', description: 'Desc 1', column: 'backlog', priority: 'medium' },
      { title: 'Task 2', description: 'Desc 2', column: 'backlog', priority: 'medium' },
    ])

    await swarmService.startSession(session.id)

    const finalSession = swarmService.getSession(session.id)
    expect(finalSession).not.toBeNull()
    expect(finalSession!.state.status).toBe(SwarmStatus.COMPLETED)
    expect(finalSession!.state.consensusReached).toBe(true)
  })

  it('agent assignment', async () => {
    const config = {
      maxAgents: 5,
      maxRounds: 3,
      consensusThreshold: 0.8,
      timeoutMs: 5000,
      enableReflection: false,
    }
    const session = swarmService.createSession(config, 'Test Assignment')

    kanban.bulkCreate([
      { title: 'Plan', description: 'Plan desc', column: 'backlog', priority: 'high' },
      { title: 'Build', description: 'Build desc', column: 'backlog', priority: 'high' },
    ])

    await swarmService.startSession(session.id)

    expect(kanban.assignments.length).toBeGreaterThanOrEqual(2)
    const agentIds = new Set(session.state.agentIds)
    for (const assignment of kanban.assignments) {
      expect(agentIds.has(assignment.agentId)).toBe(true)
    }
  })

  it('result collection', async () => {
    const config = {
      maxAgents: 5,
      maxRounds: 3,
      consensusThreshold: 0.8,
      timeoutMs: 5000,
      enableReflection: false,
    }
    const session = swarmService.createSession(config, 'Test Results')

    modelRouter.response = 'Implementation complete with tests'

    kanban.bulkCreate([
      { title: 'Task A', description: 'Do A', column: 'backlog', priority: 'medium' },
    ])

    await swarmService.startSession(session.id)

    const finalSession = swarmService.getSession(session.id)
    expect(finalSession!.state.messages.length).toBeGreaterThan(0)
    expect(
      finalSession!.state.messages.some((m) => m.includes('Implementation complete'))
    ).toBe(true)

    expect(memory.entries.length).toBeGreaterThan(0)
    expect(
      memory.entries.some((e) => e.content.includes('Implementation complete'))
    ).toBe(true)
  })

  it('timeout', async () => {
    const config = {
      maxAgents: 5,
      maxRounds: 10,
      consensusThreshold: 0.8,
      timeoutMs: 100,
      enableReflection: false,
    }
    const session = swarmService.createSession(config, 'Test Timeout')

    modelRouter.delayMs = 300

    kanban.bulkCreate([
      { title: 'Slow Task', description: 'Very slow', column: 'backlog', priority: 'medium' },
    ])

    const start = Date.now()
    await swarmService.startSession(session.id)
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(1000)

    const finalSession = swarmService.getSession(session.id)
    expect(finalSession!.state.status).not.toBe(SwarmStatus.COMPLETED)
    expect(finalSession!.state.consensusReached).toBe(false)
  })

  it('cancellation', async () => {
    const config = {
      maxAgents: 5,
      maxRounds: 10,
      consensusThreshold: 0.8,
      timeoutMs: 0,
      enableReflection: false,
    }
    const session = swarmService.createSession(config, 'Test Cancel')

    modelRouter.delayMs = 300

    kanban.bulkCreate([
      { title: 'Task', description: 'Desc', column: 'backlog', priority: 'medium' },
    ])

    const startPromise = swarmService.startSession(session.id)

    await new Promise((r) => setTimeout(r, 50))
    swarmService.stopSession(session.id)

    await startPromise

    const finalSession = swarmService.getSession(session.id)
    expect(finalSession!.state.status).toBe(SwarmStatus.IDLE)
    expect(finalSession!.state.consensusReached).toBe(false)
  })
})
