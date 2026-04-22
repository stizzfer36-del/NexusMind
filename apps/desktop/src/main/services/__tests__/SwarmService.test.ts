import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SwarmService } from '../SwarmService.js'
import { ServiceRegistry, SERVICE_TOKENS } from '../../ServiceRegistry.js'
import { SwarmStatus } from '@nexusmind/shared'
import { WindowManager } from '../../windows/WindowManager.js'

vi.mock('electron', () => ({
  BrowserWindow: class {
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

describe('SwarmService', () => {
  let registry: ServiceRegistry
  let swarm: SwarmService
  let routeMock: any
  let storeMock: any
  let getNextTaskMock: any
  let assignToAgentMock: any
  let updateTaskMock: any
  let bulkCreateMock: any

  beforeEach(() => {
    registry = ServiceRegistry.getInstance()
    registry.clear()

    // Register a mock main window so push() doesn't crash on undefined?.webContents.send
    const mockWin = {
      webContents: { send: vi.fn() },
      isDestroyed: () => false,
      on: vi.fn(() => mockWin),
      once: vi.fn(() => mockWin),
    } as any
    WindowManager.getInstance().register('main', mockWin)

    routeMock = vi.fn(async function* () {
      yield { content: 'All good', isDone: true }
    })

    storeMock = vi.fn()

    getNextTaskMock = vi.fn((_role: string) => ({
      id: 'task-001',
      title: 'Sample task',
      description: 'Do something important',
    }))

    assignToAgentMock = vi.fn()
    updateTaskMock = vi.fn()
    bulkCreateMock = vi.fn((tasks: any[]) => tasks.map((t, i) => ({ id: `task-id-${i}`, ...t })))

    registry.register(SERVICE_TOKENS.ModelRouter, { route: routeMock })
    registry.register(SERVICE_TOKENS.MemoryService, { store: storeMock })
    registry.register(SERVICE_TOKENS.KanbanService, {
      getNextTask: getNextTaskMock,
      assignToAgent: assignToAgentMock,
      updateTask: updateTaskMock,
      bulkCreate: bulkCreateMock,
    })
    registry.register(SERVICE_TOKENS.MCPService, {
      executeTool: vi.fn(async () => ({ result: 'ok' })),
    })
    registry.register(SERVICE_TOKENS.EventRecorder, {
      startSession: vi.fn(),
      endSession: vi.fn(),
      record: vi.fn(),
    })
    registry.register(SERVICE_TOKENS.LinkService, {
      broadcast: vi.fn(),
    })

    swarm = new SwarmService()
    swarm.init()
  })

  afterEach(() => {
    registry.clear()
  })

  it('HAPPY PATH — task dispatch', async () => {
    const config = {
      maxAgents: 5,
      maxRounds: 3,
      consensusThreshold: 0.8,
      timeoutMs: 0,
      enableReflection: false,
    }
    const session = swarm.createSession(config, 'build a login page')

    expect(session.id).toBeDefined()
    expect(session.name).toBe('build a login page')

    await swarm.startSession(session.id)

    const final = swarm.getSession(session.id)
    expect(final).not.toBeNull()
    expect(final!.state.status).toBe(SwarmStatus.COMPLETED)
    expect(final!.state.consensusReached).toBe(true)
    expect(routeMock).toHaveBeenCalled()
  })

  it('AGENT ASSIGNMENT', async () => {
    const config = {
      maxAgents: 5,
      maxRounds: 3,
      consensusThreshold: 0.8,
      timeoutMs: 0,
      enableReflection: false,
    }
    swarm.createSession(config, 'Agent Assignment Test')

    await swarm.startSession(
      [...swarm.listSessions()].find((s) => s.name === 'Agent Assignment Test')!.id,
    )

    // The coordinator is the first agent to run.
    expect(routeMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining('coordinator agent'),
        }),
      ]),
    )
  })

  it('RESULT COLLECTION', async () => {
    const config = {
      maxAgents: 5,
      maxRounds: 3,
      consensusThreshold: 0.8,
      timeoutMs: 0,
      enableReflection: false,
    }
    const session = swarm.createSession(config, 'Result Collection Test')

    await swarm.startSession(session.id)

    expect(storeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'episodic',
        content: expect.stringContaining('All good'),
      }),
    )
  })

  it('TIMEOUT / CANCELLATION', async () => {
    const config = {
      maxAgents: 5,
      maxRounds: 10,
      consensusThreshold: 0.8,
      timeoutMs: 0,
      enableReflection: false,
    }
    const session = swarm.createSession(config, 'Cancellation Test')

    // Make route() very slow so we can cancel mid-run
    routeMock.mockImplementation(async function* () {
      await new Promise((r) => setTimeout(r, 300))
      yield { content: 'All good', isDone: true }
    })

    const startPromise = swarm.startSession(session.id)

    // Let the coordinator node begin its route() call
    await new Promise((r) => setTimeout(r, 20))

    swarm.stopSession(session.id)

    await startPromise

    const final = swarm.getSession(session.id)
    expect(final!.state.status).not.toBe(SwarmStatus.COMPLETED)
    expect(final!.state.consensusReached).toBe(false)

    // After cancellation, no further ModelRouter calls should have been made
    // beyond the coordinator call that was already in flight.
    expect(routeMock).toHaveBeenCalledTimes(1)
  })

  it('SILENT INIT FAILURE', async () => {
    const config = {
      maxAgents: 5,
      maxRounds: 3,
      consensusThreshold: 0.8,
      timeoutMs: 0,
      enableReflection: false,
    }
    const session = swarm.createSession(config, 'Silent Failure Test')

    // Make the first (and only) route() call throw
    routeMock.mockImplementation(async function* () {
      throw new Error('Model init failed')
    })

    // Must NOT throw an unhandled exception that crashes the main process
    await expect(swarm.startSession(session.id)).resolves.not.toThrow()

    const final = swarm.getSession(session.id)
    expect(final!.state.status).toBe(SwarmStatus.FAILED)
  })
})
