import { randomUUID } from 'crypto'
import { ModelCapability, ModelProvider, type StreamChunk } from '@nexusmind/shared'
import type { ModelConfig } from '@nexusmind/shared'
import { BaseProvider, type CompletionParams } from './BaseProvider.js'

const OPENROUTER_MODELS: ModelConfig[] = [
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

export class OpenRouterProvider extends BaseProvider {
  readonly name = ModelProvider.OPENROUTER
  readonly knownModels = OPENROUTER_MODELS

  async *streamCompletion(params: CompletionParams): AsyncGenerator<StreamChunk> {
    const baseUrl = params.config.baseUrl ?? 'https://openrouter.ai/api/v1'
    const openAIMessages = params.messages.map((m) => ({ role: m.role, content: m.content }))

    let response: Response
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.apiKey ?? ''}`,
          'HTTP-Referer': 'https://nexusmind.app',
          'X-Title': 'NexusMind',
        },
        body: JSON.stringify({
          model: params.config.id,
          messages: openAIMessages,
          stream: true,
          max_tokens: params.config.maxTokens,
          temperature: params.config.temperature,
          top_p: params.config.topP,
        }),
      })
    } catch (err) {
      console.error('[OpenRouterProvider] fetch error:', err)
      yield this.errorChunk(params.config.id, String(err))
      return
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText)
      console.error('[OpenRouterProvider] API error:', response.status, text)
      if (response.status === 401) {
        yield this.errorChunk(params.config.id, `OpenRouter auth error: invalid API key`)
      } else {
        yield this.errorChunk(params.config.id, `OpenRouter API error ${response.status}: ${text}`)
      }
      return
    }

    let index = 0
    try {
      for await (const raw of this.parseSSE(response)) {
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
          modelId: params.config.id,
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
      console.error('[OpenRouterProvider] stream error:', err)
      yield this.errorChunk(params.config.id, String(err))
    }
  }
}
