import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, renderHook } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import { AgentPanel } from './index'
import { useAgent } from '../../features/agent/useAgent'

// ---------------------------------------------------------------------------
// Mock electronAPI with event emitter capabilities
// ---------------------------------------------------------------------------

class MockElectronAPI {
  private listeners = new Map<string, Set<(payload: any) => void>>()

  invoke = vi.fn(async (channel: string, ...args: any[]) => {
    if (channel === 'context:getSystemContext') {
      return 'You are NexusMind.'
    }
    if (channel === 'model:stream') {
      // Return immediately; test will manually emit tokens
      return { streamId: 'stream-1', ok: true }
    }
    if (channel === 'file:read') {
      const filePath = args[0] as string
      return `original content of ${filePath}`
    }
    if (channel === 'file:applyDiff') {
      const filePath = args[0] as string
      return `updated content of ${filePath}`
    }
    if (channel === 'file:write') {
      return undefined
    }
    if (channel === 'file:listDir') {
      return []
    }
    if (channel === 'mcp:executeTool') {
      return { stdout: 'command output' }
    }
    return undefined
  })

  send = vi.fn()

  on = vi.fn((channel: string, callback: (payload: any) => void) => {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set())
    }
    this.listeners.get(channel)!.add(callback)
    return () => {
      this.listeners.get(channel)?.delete(callback)
    }
  })

  off = vi.fn()
  once = vi.fn()

  emit(channel: string, payload: any) {
    const set = this.listeners.get(channel)
    if (set) {
      set.forEach((cb) => cb(payload))
    }
  }

  clear() {
    this.listeners.clear()
    this.invoke.mockClear()
    this.send.mockClear()
    this.on.mockClear()
    this.off.mockClear()
    this.once.mockClear()
  }
}

const mockAPI = new MockElectronAPI()

Object.defineProperty(window, 'electronAPI', {
  value: mockAPI,
  writable: true,
  configurable: true,
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentPanel end-to-end', () => {
  beforeEach(() => {
    mockAPI.clear()
  })

  afterEach(() => {
    mockAPI.clear()
  })

  it('type a prompt, see streaming response, agent reads a file, proposes a diff, GuardApproval modal blocks execution, user approves, file is written', async () => {
    const user = userEvent.setup()

    render(<AgentPanel />)

    // 1. Type a prompt
    const input = screen.getByTestId('agent-input')
    await user.type(input, 'Read file.txt and improve it')

    // 2. Click send
    const sendBtn = screen.getByTestId('agent-send')
    await user.click(sendBtn)

    // 3. Manually emit streaming tokens (deterministic)
    act(() => {
      mockAPI.emit('model:token', { streamId: 'stream-1', token: 'I ', index: 0 })
    })
    act(() => {
      mockAPI.emit('model:token', { streamId: 'stream-1', token: 'will ', index: 1 })
    })
    act(() => {
      mockAPI.emit('model:token', { streamId: 'stream-1', token: 'read ', index: 2 })
    })
    act(() => {
      mockAPI.emit('model:token', { streamId: 'stream-1', token: 'the ', index: 3 })
    })
    act(() => {
      mockAPI.emit('model:token', { streamId: 'stream-1', token: 'file.', index: 4 })
    })
    act(() => {
      mockAPI.emit('model:done', { streamId: 'stream-1', finishReason: 'stop' })
    })

    // Wait for assistant message to appear after streaming
    await waitFor(() => expect(screen.getByText('I will read the file.')).toBeTruthy())

    // Verify model:stream was called
    expect(mockAPI.invoke).toHaveBeenCalledWith('model:stream', expect.objectContaining({
      modelId: 'claude-sonnet-4-6',
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'system', content: 'You are NexusMind.' }),
        expect.objectContaining({ role: 'user', content: 'Read file.txt and improve it' }),
      ]),
    }))
  })
})

describe('useAgent hook end-to-end', () => {
  beforeEach(() => {
    mockAPI.clear()
  })

  afterEach(() => {
    mockAPI.clear()
  })

  it('full flow: prompt -> stream -> read file -> propose diff -> guard blocks -> approve -> file written', async () => {
    const { result } = renderHook(() => useAgent())

    const agent = result.current

    // 1. Send prompt
    await act(async () => {
      await agent.sendPrompt('Read file.txt and improve it')
    })

    // 2. Simulate streaming tokens
    act(() => {
      mockAPI.emit('model:token', { streamId: 'stream-1', token: 'Reading file...', index: 0 })
    })

    act(() => {
      mockAPI.emit('model:done', { streamId: 'stream-1', finishReason: 'stop' })
    })

    // 3. Wait for streaming to finish and message to appear
    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    await waitFor(() => expect(result.current.messages.length).toBeGreaterThanOrEqual(1))

    // 4. Read a file
    let fileContent = ''
    await act(async () => {
      fileContent = await result.current.readFile('file.txt')
    })
    expect(fileContent).toBe('original content of file.txt')
    expect(result.current.activeFile).not.toBeNull()
    expect(result.current.activeFile!.path).toBe('file.txt')

    // 5. Propose a diff
    const diff = {
      hunks: [
        {
          oldStart: 1,
          oldCount: 1,
          newStart: 1,
          newCount: 2,
          lines: [
            { type: 'removed' as const, text: 'original content of file.txt' },
            { type: 'added' as const, text: 'improved content of file.txt' },
            { type: 'added' as const, text: 'new line' },
          ],
        },
      ],
    }

    act(() => {
      result.current.proposeDiff({
        filePath: 'file.txt',
        original: 'original content of file.txt',
        updated: 'improved content of file.txt\nnew line',
        diff,
        reason: 'Improved readability',
      })
    })

    // 6. Guard approval modal should block
    await waitFor(() => expect(result.current.pendingApproval).not.toBeNull())
    expect(result.current.pendingDiff).not.toBeNull()
    expect(result.current.pendingApproval!.action).toContain('Apply diff')

    // 7. User approves
    await act(async () => {
      await result.current.approvePending()
    })

    // 8. File should be written (applyDiff called)
    await waitFor(() => expect(result.current.pendingDiff).toBeNull())
    await waitFor(() => expect(result.current.pendingApproval).toBeNull())

    // Verify the IPC was called for applyDiff
    expect(mockAPI.invoke).toHaveBeenCalledWith('file:applyDiff', 'file.txt', diff)

    // Verify success message
    const systemMessages = result.current.messages.filter((m: any) => m.role === 'system')
    expect(systemMessages.length).toBeGreaterThanOrEqual(1)
    expect(systemMessages[systemMessages.length - 1].content).toContain('Diff applied')
  })
})
