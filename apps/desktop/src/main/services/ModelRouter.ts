import { randomUUID } from 'crypto'
import {
  ModelProvider,
  AgentRole,
  type ModelId,
  type ModelConfig,
  type StreamChunk,
} from '@nexusmind/shared'
import type { AgentMessage } from '@nexusmind/shared'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import type { KeychainService } from './KeychainService.js'
import { ContextService } from './ContextService.js'
import { BaseProvider } from './providers/BaseProvider.js'
import { OpenAIProvider } from './providers/OpenAIProvider.js'
import { AnthropicProvider } from './providers/AnthropicProvider.js'
import { OllamaProvider } from './providers/OllamaProvider.js'
import { OpenRouterProvider } from './providers/OpenRouterProvider.js'

export class ModelRouter {
  private keychain!: KeychainService
  providers: BaseProvider[]

  async init(): Promise<void> {
    const registry = ServiceRegistry.getInstance()
    this.keychain = registry.resolve<KeychainService>(SERVICE_TOKENS.Keychain)
    this.providers = [
      new OpenAIProvider(this.keychain),
      new AnthropicProvider(this.keychain),
      new OllamaProvider(this.keychain),
      new OpenRouterProvider(this.keychain),
    ]
    registry.register(SERVICE_TOKENS.ModelRouter, this)
  }

  getKnownModels(): ModelConfig[] {
    return this.providers.flatMap((p) => p.knownModels)
  }

  async listModels(provider: ModelProvider): Promise<ModelId[]> {
    if (provider === ModelProvider.OPENROUTER) {
      return this._listOpenRouterModels()
    }
    const p = this.providers.find((p) => p.name === provider)
    return p?.knownModels.map((m) => m.id) ?? []
  }

  private async _listOpenRouterModels(): Promise<ModelId[]> {
    const key = await this.keychain.getApiKey('openrouter')
    const fallback = this.providers
      .find((p) => p.name === ModelProvider.OPENROUTER)
      ?.knownModels.map((m) => m.id) ?? []
    if (!key) return fallback
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (!response.ok) return fallback
      const data = (await response.json()) as { data: Array<{ id: string }> }
      return data.data.map((m) => m.id)
    } catch {
      return fallback
    }
  }

  async validateKey(provider: ModelProvider): Promise<boolean> {
    const key = await this.keychain.getApiKey(
      provider === ModelProvider.OPENROUTER ? 'openrouter' : provider
    )
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

  private _injectSystemContext(messages: AgentMessage[]): AgentMessage[] {
    let contextText = ''
    try {
      const ctx = ServiceRegistry.getInstance().resolve<ContextService>(
        SERVICE_TOKENS.ContextService
      )
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

  async *streamCompletion(params: {
    config: ModelConfig
    messages: AgentMessage[]
  }): AsyncGenerator<StreamChunk> {
    const provider = this.providers.find((p) => p.name === params.config.provider)
    if (!provider) {
      yield _errorChunk(params.config.id, `Unsupported provider: ${params.config.provider}`)
      return
    }

    const apiKey = await this.keychain.getApiKey(params.config.provider)
    const enrichedMessages = this._injectSystemContext(params.messages)

    yield* provider.streamCompletion({
      config: params.config,
      messages: enrichedMessages,
      apiKey,
    })
  }

  async *route(
    config: ModelConfig,
    messages: AgentMessage[],
  ): AsyncGenerator<StreamChunk> {
    yield* this.streamCompletion({ config, messages })
  }

  async *streamChat(
    modelId: ModelId,
    messages: Array<{ role: string; content: string }>,
  ): AsyncGenerator<StreamChunk> {
    const modelConfig = this.getKnownModels().find((m) => m.id === modelId)
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

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'models:list': (_event: any) => this.getKnownModels(),

      'models:getConfig': (_event: any, modelId: string) =>
        this.getKnownModels().find((m) => m.id === modelId) ?? null,

      'model:list': (_event: any, provider: string) =>
        this.listModels(provider as ModelProvider),

      'model:validate': (_event: any, provider: string) =>
        this.validateKey(provider as ModelProvider),

      'models:streamChat': (
        event: any,
        payload: { modelId: ModelId; messages: Array<{ role: string; content: string }> },
      ) => {
        const modelConfig = this.getKnownModels().find((m) => m.id === payload.modelId)
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

      'model:route': (event: any, config: ModelConfig, messages: AgentMessage[]) => {
        const streamId = randomUUID()

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
