import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OpenAIProvider } from '../OpenAIProvider.js'
import type { KeychainService } from '../../KeychainService.js'
import { ModelCapability, ModelProvider } from '@nexusmind/shared'

const mockKeychain = {
  getApiKey: vi.fn(),
} as unknown as KeychainService

function createReadableStream(chunks: string[]) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk))
      }
      controller.close()
    },
  })
}

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider

  beforeEach(() => {
    provider = new OpenAIProvider(mockKeychain)
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('happy path SSE stream parsing returns correct tokens', async () => {
    const chunks = [
      'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":" world"},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      body: createReadableStream(chunks),
    } as unknown as Response)

    const result: any[] = []
    for await (const chunk of provider.streamCompletion({
      config: {
        id: 'gpt-4o',
        provider: ModelProvider.OPENAI,
        name: 'GPT-4o',
        capabilities: [ModelCapability.CHAT],
        contextWindow: 128_000,
        maxTokens: 4_096,
      },
      messages: [
        { id: '1', agentId: 'test', role: 'user', content: 'Hi', timestamp: Date.now() },
      ],
      apiKey: 'sk-test',
    })) {
      result.push(chunk)
    }

    expect(result).toHaveLength(2)
    expect(result[0].content).toBe('Hello')
    expect(result[0].isDone).toBe(false)
    expect(result[1].content).toBe(' world')
    expect(result[1].isDone).toBe(true)
    expect(result[1].finishReason).toBe('stop')
  })

  it('error response from API returns structured error not a thrown exception', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve('Something went wrong'),
    } as unknown as Response)

    const result: any[] = []
    for await (const chunk of provider.streamCompletion({
      config: {
        id: 'gpt-4o',
        provider: ModelProvider.OPENAI,
        name: 'GPT-4o',
        capabilities: [ModelCapability.CHAT],
        contextWindow: 128_000,
        maxTokens: 4_096,
      },
      messages: [
        { id: '1', agentId: 'test', role: 'user', content: 'Hi', timestamp: Date.now() },
      ],
      apiKey: 'sk-test',
    })) {
      result.push(chunk)
    }

    expect(result).toHaveLength(1)
    expect(result[0].isDone).toBe(true)
    expect(result[0].finishReason).toBe('error')
    expect(result[0].content).toContain('500')
  })

  it('getApiKey returning null causes the method to return an auth-error result', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('Invalid API key'),
    } as unknown as Response)

    const result: any[] = []
    for await (const chunk of provider.streamCompletion({
      config: {
        id: 'gpt-4o',
        provider: ModelProvider.OPENAI,
        name: 'GPT-4o',
        capabilities: [ModelCapability.CHAT],
        contextWindow: 128_000,
        maxTokens: 4_096,
      },
      messages: [
        { id: '1', agentId: 'test', role: 'user', content: 'Hi', timestamp: Date.now() },
      ],
      apiKey: null,
    })) {
      result.push(chunk)
    }

    expect(result).toHaveLength(1)
    expect(result[0].isDone).toBe(true)
    expect(result[0].finishReason).toBe('error')
    expect(result[0].content).toMatch(/401|Unauthorized|auth/i)
  })
})
