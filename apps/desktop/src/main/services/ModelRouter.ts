import { randomUUID } from 'crypto'
import {
  ModelProvider,
  ModelCapability,
  AgentRole,
  type ModelId,
  type ModelConfig,
  type StreamChunk,
} from '@nexusmind/shared'
import type { AgentMessage } from '@nexusmind/shared'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import type { KeychainService } from './KeychainService.js'
import { ContextService } from './ContextService.js'

// ---------------------------------------------------------------------------
// SSE parsing helper
// ---------------------------------------------------------------------------

async function* parseSSE(response: Response): AsyncGenerator<string> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        yield line.slice(6)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Hardcoded model catalogue
// ---------------------------------------------------------------------------

const MODEL_IDS: Record<ModelProvider, ModelId[]> = {
  [ModelProvider.OPENAI]: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  [ModelProvider.ANTHROPIC]: [
    'claude-opus-4-7',
    'claude-sonnet-4-6',
    'claude-haiku-4-5-20251001',
  ],
  [ModelProvider.LOCAL]: ['llama3', 'mistral', 'codellama'],
  [ModelProvider.OPENROUTER]: ['openai/gpt-4o', 'anthropic/claude-sonnet-4-6', 'meta-llama/llama-3.1-8b-instruct:free'],
  [ModelProvider.GOOGLE]: [],
  [ModelProvider.MISTRAL]: [],
  [ModelProvider.COHERE]: [],
  [ModelProvider.CUSTOM]: [],
}

const KNOWN_MODELS: ModelConfig[] = [
  // OpenAI
  {
    id: 'gpt-4o',
    provider: ModelProvider.OPENAI,
    name: 'GPT-4o',
    capabilities: [
      ModelCapability.CHAT,
      ModelCapability.VISION,
      ModelCapability.FUNCTION_CALLING,
      ModelCapability.STREAMING,
    ],
    contextWindow: 128_000,
    maxTokens: 4_096,
    apiKeyEnvVar: 'OPENAI_API_KEY',
  },
  {
    id: 'gpt-4o-mini',
    provider: ModelProvider.OPENAI,
    name: 'GPT-4o Mini',
    capabilities: [
      ModelCapability.CHAT,
      ModelCapability.FUNCTION_CALLING,
      ModelCapability.STREAMING,
    ],
    contextWindow: 128_000,
    maxTokens: 4_096,
    apiKeyEnvVar: 'OPENAI_API_KEY',
  },
  {
    id: 'gpt-4-turbo',
    provider: ModelProvider.OPENAI,
    name: 'GPT-4 Turbo',
    capabilities: [
      ModelCapability.CHAT,
      ModelCapability.VISION,
      ModelCapability.FUNCTION_CALLING,
      ModelCapability.STREAMING,
    ],
    contextWindow: 128_000,
    maxTokens: 4_096,
    apiKeyEnvVar: 'OPENAI_API_KEY',
  },
  {
    id: 'gpt-3.5-turbo',
    provider: ModelProvider.OPENAI,
    name: 'GPT-3.5 Turbo',
    capabilities: [ModelCapability.CHAT, ModelCapability.FUNCTION_CALLING, ModelCapability.STREAMING],
    contextWindow: 16_385,
    maxTokens: 4_096,
    apiKeyEnvVar: 'OPENAI_API_KEY',
  },
  // Anthropic
  {
    id: 'claude-opus-4-7',
    provider: ModelProvider.ANTHROPIC,
    name: 'Claude Opus 4.7',
    capabilities: [
      ModelCapability.CHAT,
      ModelCapability.VISION,
      ModelCapability.FUNCTION_CALLING,
      ModelCapability.REASONING,
      ModelCapability.CODE,
      ModelCapability.STREAMING,
    ],
    contextWindow: 200_000,
    maxTokens: 8_192,
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'claude-sonnet-4-6',
    provider: ModelProvider.ANTHROPIC,
    name: 'Claude Sonnet 4.6',
    capabilities: [
      ModelCapability.CHAT,
      ModelCapability.VISION,
      ModelCapability.FUNCTION_CALLING,
      ModelCapability.CODE,
      ModelCapability.STREAMING,
    ],
    contextWindow: 200_000,
    maxTokens: 8_192,
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    provider: ModelProvider.ANTHROPIC,
    name: 'Claude Haiku 4.5',
    capabilities: [ModelCapability.CHAT, ModelCapability.STREAMING],
    contextWindow: 200_000,
    maxTokens: 4_096,
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
  },
  // Local (Ollama)
  {
    id: 'llama3',
    provider: ModelProvider.LOCAL,
    name: 'Llama 3',
    capabilities: [ModelCapability.CHAT, ModelCapability.CODE, ModelCapability.STREAMING],
    contextWindow: 8_192,
    maxTokens: 2_048,
    baseUrl: 'http://localhost:11434',
  },
  {
    id: 'mistral',
    provider: ModelProvider.LOCAL,
    name: 'Mistral',
    capabilities: [ModelCapability.CHAT, ModelCapability.STREAMING],
    contextWindow: 8_192,
    maxTokens: 2_048,
    baseUrl: 'http://localhost:11434',
  },
  {
    id: 'codellama',
    provider: ModelProvider.LOCAL,
    name: 'CodeLlama',
    capabilities: [ModelCapability.CHAT, ModelCapability.CODE, ModelCapability.STREAMING],
    contextWindow: 16_384,
    maxTokens: 4_096,
    baseUrl: 'http://localhost:11434',
  },
  // OpenRouter
  {
    id: 'openai/gpt-4o',
    provider: ModelProvider.OPENROUTER,
    name: 'GPT-4o (via OpenRouter)',
    capabilities: [ModelCapability.CHAT, ModelCapability.VISION, ModelCapability.FUNCTION_CALLING, ModelCapability.STREAMING],
    contextWindow: 128_000,
    maxTokens: 4_096,
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'anthropic/claude-sonnet-4-6',
    provider: ModelProvider.OPENROUTER,
    name: 'Claude Sonnet 4.6 (via OpenRouter)',
    capabilities: [ModelCapability.CHAT, ModelCapability.STREAMING],
    contextWindow: 200_000,
    maxTokens: 8_192,
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'meta-llama/llama-3.1-8b-instruct:free',
    provider: ModelProvider.OPENROUTER,
    name: 'Llama 3.1 8B (Free, via OpenRouter)',
    capabilities: [ModelCapability.CHAT, ModelCapability.STREAMING],
    contextWindow: 131_072,
    maxTokens: 2_048,
    baseUrl: 'https://openrouter.ai/api/v1',
  },
]

// ---------------------------------------------------------------------------
// ModelRouter
// ---------------------------------------------------------------------------

export class ModelRouter {
  private keychain!: KeychainService

  async init(): Promise<void> {
    const registry = ServiceRegistry.getInstance()
    this.keychain = registry.resolve<KeychainService>(SERVICE_TOKENS.Keychain)
    registry.register(SERVICE_TOKENS.ModelRouter, this)
  }

  // -------------------------------------------------------------------------
  // getKnownModels — returns the full static model catalogue
  // -------------------------------------------------------------------------

  getKnownModels(): ModelConfig[] {
    return KNOWN_MODELS
  }

  // -------------------------------------------------------------------------
  // listModels
  // -------------------------------------------------------------------------

  async listModels(provider: ModelProvider): Promise<ModelId[]> {
    if (provider === ModelProvider.OPENROUTER) {
      return this._listOpenRouterModels()
    }
    return MODEL_IDS[provider] ?? []
  }

  private async _listOpenRouterModels(): Promise<ModelId[]> {
    const key = await this.keychain.getApiKey('openrouter')
    if (!key) return MODEL_IDS[ModelProvider.OPENROUTER]
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (!response.ok) return MODEL_IDS[ModelProvider.OPENROUTER]
      const data = await response.json() as { data: Array<{ id: string }> }
      return data.data.map(m => m.id)
    } catch {
      return MODEL_IDS[ModelProvider.OPENROUTER]
    }
  }

  // -------------------------------------------------------------------------
  // validateKey
  // -------------------------------------------------------------------------

  async validateKey(provider: ModelProvider): Promise<boolean> {
    const key = await this.keychain.getApiKey(provider === ModelProvider.OPENROUTER ? 'openrouter' : provider)
    if (!key || key.length === 0) return false
    if (provider === ModelProvider.OPENROUTER) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
          headers: { Authorization: `Bearer ${key}` },
        })
        return response.ok
      } catch {
        return false
      }
    }
    return true
  }

  // -------------------------------------------------------------------------
  // System context injection
  // -------------------------------------------------------------------------

  private _injectSystemContext(messages: AgentMessage[]): AgentMessage[] {
    let contextText = ''
    try {
      const ctx = ServiceRegistry.getInstance().resolve<ContextService>(SERVICE_TOKENS.ContextService)
      contextText = ctx.buildSystemContext()
    } catch {
      // ContextService not available — proceed without context
    }

    if (!contextText) return messages

    const systemMessage: AgentMessage = {
      id: randomUUID(),
      agentId: 'system',
      role: AgentRole.SYSTEM,
      content: contextText,
      timestamp: Date.now(),
    }

    // Insert after any existing system messages, or at the front
    const firstNonSystem = messages.findIndex((m) => m.role !== AgentRole.SYSTEM)
    if (firstNonSystem === -1) {
      return [...messages, systemMessage]
    }
    return [
      ...messages.slice(0, firstNonSystem),
      systemMessage,
      ...messages.slice(firstNonSystem),
    ]
  }

  // -------------------------------------------------------------------------
  // route — streaming chat completion
  // -------------------------------------------------------------------------

  async *route(
    config: ModelConfig,
    messages: AgentMessage[],
  ): AsyncGenerator<StreamChunk> {
    const apiKey = await this.keychain.getApiKey(config.provider)

    // Inject system context from ContextService as the first SYSTEM message
    const enrichedMessages = this._injectSystemContext(messages)

    switch (config.provider) {
      case ModelProvider.OPENAI:
        yield* this._routeOpenAI(config, enrichedMessages, apiKey)
        break
      case ModelProvider.ANTHROPIC:
        yield* this._routeAnthropic(config, enrichedMessages, apiKey)
        break
      case ModelProvider.LOCAL:
        yield* this._routeLocal(config, enrichedMessages)
        break
      case ModelProvider.OPENROUTER:
        yield* this._routeOpenRouter(config, enrichedMessages, apiKey)
        break
      default:
        yield {
          id: randomUUID(),
          modelId: config.id,
          content: `Unsupported provider: ${config.provider}`,
          index: 0,
          isDone: true,
          finishReason: 'error',
        } satisfies StreamChunk
    }
  }

  // -------------------------------------------------------------------------
  // Provider-specific streaming implementations
  // -------------------------------------------------------------------------

  private async *_routeOpenAI(
    config: ModelConfig,
    messages: AgentMessage[],
    apiKey: string | null,
  ): AsyncGenerator<StreamChunk> {
    const openAIMessages = messages.map((m) => ({ role: m.role, content: m.content }))

    let response: Response
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey ?? ''}`,
        },
        body: JSON.stringify({
          model: config.id,
          messages: openAIMessages,
          stream: true,
          max_tokens: config.maxTokens,
          temperature: config.temperature,
          top_p: config.topP,
        }),
      })
    } catch (err) {
      console.error('[ModelRouter] OpenAI fetch error:', err)
      yield _errorChunk(config.id, String(err))
      return
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText)
      console.error('[ModelRouter] OpenAI API error:', response.status, text)
      yield _errorChunk(config.id, `OpenAI API error ${response.status}: ${text}`)
      return
    }

    let index = 0
    try {
      for await (const raw of parseSSE(response)) {
        let parsed: any
        try {
          parsed = JSON.parse(raw)
        } catch {
          continue
        }

        const choice = parsed.choices?.[0]
        if (!choice) continue

        const delta: string = choice.delta?.content ?? ''
        const finishReason: string | undefined = choice.finish_reason ?? undefined
        const isDone = finishReason != null

        const chunk: StreamChunk = {
          id: parsed.id ?? randomUUID(),
          modelId: config.id,
          content: delta,
          index: index++,
          isDone,
          finishReason,
        }

        if (parsed.usage) {
          chunk.usage = {
            promptTokens: parsed.usage.prompt_tokens ?? 0,
            completionTokens: parsed.usage.completion_tokens ?? 0,
            totalTokens: parsed.usage.total_tokens ?? 0,
          }
        }

        yield chunk
        if (isDone) break
      }
    } catch (err) {
      console.error('[ModelRouter] OpenAI stream error:', err)
      yield _errorChunk(config.id, String(err))
    }
  }

  private async *_routeAnthropic(
    config: ModelConfig,
    messages: AgentMessage[],
    apiKey: string | null,
  ): AsyncGenerator<StreamChunk> {
    const anthropicMessages = messages.map((m) => ({ role: m.role, content: m.content }))

    let response: Response
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.id,
          messages: anthropicMessages,
          max_tokens: config.maxTokens,
          temperature: config.temperature,
          top_p: config.topP,
          stream: true,
        }),
      })
    } catch (err) {
      console.error('[ModelRouter] Anthropic fetch error:', err)
      yield _errorChunk(config.id, String(err))
      return
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText)
      console.error('[ModelRouter] Anthropic API error:', response.status, text)
      yield _errorChunk(config.id, `Anthropic API error ${response.status}: ${text}`)
      return
    }

    let index = 0
    let inputTokens = 0
    let outputTokens = 0

    try {
      for await (const raw of parseSSE(response)) {
        let parsed: any
        try {
          parsed = JSON.parse(raw)
        } catch {
          continue
        }

        const eventType: string = parsed.type ?? ''

        if (eventType === 'message_start') {
          inputTokens = parsed.message?.usage?.input_tokens ?? 0
          continue
        }

        if (eventType === 'content_block_delta') {
          const delta: string = parsed.delta?.text ?? ''
          yield {
            id: randomUUID(),
            modelId: config.id,
            content: delta,
            index: index++,
            isDone: false,
          } satisfies StreamChunk
          continue
        }

        if (eventType === 'message_delta') {
          outputTokens = parsed.usage?.output_tokens ?? 0
          continue
        }

        if (eventType === 'message_stop') {
          yield {
            id: randomUUID(),
            modelId: config.id,
            content: '',
            index: index++,
            isDone: true,
            finishReason: parsed.stop_reason ?? 'end_turn',
            usage: {
              promptTokens: inputTokens,
              completionTokens: outputTokens,
              totalTokens: inputTokens + outputTokens,
            },
          } satisfies StreamChunk
          break
        }
      }
    } catch (err) {
      console.error('[ModelRouter] Anthropic stream error:', err)
      yield _errorChunk(config.id, String(err))
    }
  }

  private async *_routeLocal(
    config: ModelConfig,
    messages: AgentMessage[],
  ): AsyncGenerator<StreamChunk> {
    const baseUrl = config.baseUrl ?? 'http://localhost:11434'
    const ollamaMessages = messages.map((m) => ({ role: m.role, content: m.content }))

    let response: Response
    try {
      response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.id,
          messages: ollamaMessages,
          stream: true,
          options: {
            temperature: config.temperature,
            top_p: config.topP,
            num_predict: config.maxTokens,
          },
        }),
      })
    } catch (err) {
      console.error('[ModelRouter] Local (Ollama) fetch error:', err)
      yield _errorChunk(config.id, String(err))
      return
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText)
      console.error('[ModelRouter] Ollama API error:', response.status, text)
      yield _errorChunk(config.id, `Ollama API error ${response.status}: ${text}`)
      return
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let index = 0

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          let parsed: any
          try {
            parsed = JSON.parse(trimmed)
          } catch {
            continue
          }

          const content: string = parsed.message?.content ?? ''
          const isDone: boolean = parsed.done ?? false

          const chunk: StreamChunk = {
            id: randomUUID(),
            modelId: config.id,
            content,
            index: index++,
            isDone,
          }

          if (isDone && parsed.eval_count != null) {
            chunk.finishReason = 'stop'
            chunk.usage = {
              promptTokens: parsed.prompt_eval_count ?? 0,
              completionTokens: parsed.eval_count ?? 0,
              totalTokens: (parsed.prompt_eval_count ?? 0) + (parsed.eval_count ?? 0),
            }
          }

          yield chunk
          if (isDone) break
        }
      }
    } catch (err) {
      console.error('[ModelRouter] Ollama stream error:', err)
      yield _errorChunk(config.id, String(err))
    }
  }

  private async *_routeOpenRouter(
    config: ModelConfig,
    messages: AgentMessage[],
    apiKey: string | null,
  ): AsyncGenerator<StreamChunk> {
    const baseUrl = config.baseUrl ?? 'https://openrouter.ai/api/v1'
    const openAIMessages = messages.map((m) => ({ role: m.role, content: m.content }))

    let response: Response
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey ?? ''}`,
          'HTTP-Referer': 'https://nexusmind.app',
          'X-Title': 'NexusMind',
        },
        body: JSON.stringify({
          model: config.id,
          messages: openAIMessages,
          stream: true,
          max_tokens: config.maxTokens,
          temperature: config.temperature,
          top_p: config.topP,
        }),
      })
    } catch (err) {
      console.error('[ModelRouter] OpenRouter fetch error:', err)
      yield _errorChunk(config.id, String(err))
      return
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText)
      console.error('[ModelRouter] OpenRouter API error:', response.status, text)
      if (response.status === 401) {
        yield _errorChunk(config.id, `OpenRouter auth error: invalid API key`)
      } else {
        yield _errorChunk(config.id, `OpenRouter API error ${response.status}: ${text}`)
      }
      return
    }

    // Parse identical to OpenAI SSE stream
    let index = 0
    try {
      for await (const raw of parseSSE(response)) {
        let parsed: any
        try {
          parsed = JSON.parse(raw)
        } catch {
          continue
        }

        const choice = parsed.choices?.[0]
        if (!choice) continue

        const delta: string = choice.delta?.content ?? ''
        const finishReason: string | undefined = choice.finish_reason ?? undefined
        const isDone = finishReason != null

        const chunk: StreamChunk = {
          id: parsed.id ?? randomUUID(),
          modelId: config.id,
          content: delta,
          index: index++,
          isDone,
          finishReason,
        }

        if (parsed.usage) {
          chunk.usage = {
            promptTokens: parsed.usage.prompt_tokens ?? 0,
            completionTokens: parsed.usage.completion_tokens ?? 0,
            totalTokens: parsed.usage.total_tokens ?? 0,
          }
        }

        yield chunk
        if (isDone) break
      }
    } catch (err) {
      console.error('[ModelRouter] OpenRouter stream error:', err)
      yield _errorChunk(config.id, String(err))
    }
  }

  // -------------------------------------------------------------------------
  // Dedicated streaming entry-point for IPC
  // -------------------------------------------------------------------------

  async *streamChat(
    modelId: ModelId,
    messages: Array<{ role: string; content: string }>,
  ): AsyncGenerator<StreamChunk> {
    const modelConfig = KNOWN_MODELS.find((m) => m.id === modelId)
    if (!modelConfig) {
      yield _errorChunk(modelId, `Unknown model: ${modelId}`)
      return
    }

    const agentMessages: AgentMessage[] = messages.map((m) => ({
      id: randomUUID(),
      agentId: 'ipc',
      role: m.role as AgentMessage['role'],
      content: m.content,
      timestamp: Date.now(),
    }))

    yield* this.route(modelConfig, agentMessages)
  }

  // -------------------------------------------------------------------------
  // IPC handlers
  // -------------------------------------------------------------------------

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      // Return full list of known ModelConfig objects
      'models:list': (_event: any) => KNOWN_MODELS,

      // Look up a single ModelConfig by id
      'models:getConfig': (_event: any, modelId: string) =>
        KNOWN_MODELS.find((m) => m.id === modelId) ?? null,

      // List model IDs for a given provider
      'model:list': (_event: any, provider: string) =>
        this.listModels(provider as ModelProvider),

      // Validate the stored API key for a provider
      'model:validate': (_event: any, provider: string) =>
        this.validateKey(provider as ModelProvider),

      // Stream chat from a modelId + plain message array
      'models:streamChat': (
        event: any,
        payload: { modelId: ModelId; messages: Array<{ role: string; content: string }> },
      ) => {
        const modelConfig = KNOWN_MODELS.find((m) => m.id === payload.modelId)
        if (!modelConfig) {
          console.error('[ModelRouter] models:streamChat — unknown modelId:', payload.modelId)
          return { streamId: payload.modelId }
        }

        const agentMessages: AgentMessage[] = payload.messages.map((m) => ({
          id: randomUUID(),
          agentId: 'ipc',
          role: m.role as AgentMessage['role'],
          content: m.content,
          timestamp: Date.now(),
        }))

        // Fire-and-forget stream
        ;(async () => {
          try {
            for await (const chunk of this.route(modelConfig, agentMessages)) {
              event.sender.send('stream:data', chunk)
              if (chunk.isDone) break
            }
          } catch (err) {
            console.error('[ModelRouter] models:streamChat stream error:', err)
          } finally {
            event.sender.send('stream:end', { modelId: payload.modelId })
          }
        })()

        return { streamId: payload.modelId }
      },

      // Stream chat from a full ModelConfig + AgentMessage array
      'model:route': (event: any, config: ModelConfig, messages: AgentMessage[]) => {
        const streamId = randomUUID()

        // Fire-and-forget stream
        ;(async () => {
          try {
            for await (const chunk of this.route(config, messages)) {
              event.sender.send('stream:data', chunk)
              if (chunk.isDone) break
            }
          } catch (err) {
            console.error('[ModelRouter] model:route stream error:', err)
          } finally {
            event.sender.send('stream:end', { modelId: config.id })
          }
        })()

        return { streamId }
      },
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _errorChunk(modelId: ModelId, message: string): StreamChunk {
  return {
    id: randomUUID(),
    modelId,
    content: message,
    index: 0,
    isDone: true,
    finishReason: 'error',
  }
}
