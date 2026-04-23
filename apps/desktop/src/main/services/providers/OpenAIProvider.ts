import { randomUUID } from 'crypto'
import { ModelCapability, ModelProvider, type StreamChunk } from '@nexusmind/shared'
import type { ModelConfig } from '@nexusmind/shared'
import { BaseProvider, type CompletionParams } from './BaseProvider.js'

const OPENAI_MODELS: ModelConfig[] = [
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
]

export class OpenAIProvider extends BaseProvider {
  readonly name = ModelProvider.OPENAI
  readonly knownModels = OPENAI_MODELS

  async *streamCompletion(params: CompletionParams): AsyncGenerator<StreamChunk> {
    const openAIMessages = params.messages.map((m) => ({ role: m.role, content: m.content }))

    let response: Response
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.apiKey ?? ''}`,
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
      console.error('[OpenAIProvider] fetch error:', err)
      yield this.errorChunk(params.config.id, String(err))
      return
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText)
      console.error('[OpenAIProvider] API error:', response.status, text)
      yield this.errorChunk(params.config.id, `OpenAI API error ${response.status}: ${text}`)
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
      console.error('[OpenAIProvider] stream error:', err)
      yield this.errorChunk(params.config.id, String(err))
    }
  }
}
