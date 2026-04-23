import { randomUUID } from 'crypto'
import { ModelCapability, ModelProvider, type StreamChunk } from '@nexusmind/shared'
import type { ModelConfig } from '@nexusmind/shared'
import { BaseProvider, type CompletionParams } from './BaseProvider.js'

const ANTHROPIC_MODELS: ModelConfig[] = [
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
]

export class AnthropicProvider extends BaseProvider {
  readonly name = ModelProvider.ANTHROPIC
  readonly knownModels = ANTHROPIC_MODELS

  async *streamCompletion(params: CompletionParams): AsyncGenerator<StreamChunk> {
    const anthropicMessages = params.messages.map((m) => ({ role: m.role, content: m.content }))

    let response: Response
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': params.apiKey ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: params.config.id,
          messages: anthropicMessages,
          max_tokens: params.config.maxTokens,
          temperature: params.config.temperature,
          top_p: params.config.topP,
          stream: true,
        }),
      })
    } catch (err) {
      console.error('[AnthropicProvider] fetch error:', err)
      yield this.errorChunk(params.config.id, String(err))
      return
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText)
      console.error('[AnthropicProvider] API error:', response.status, text)
      yield this.errorChunk(params.config.id, `Anthropic API error ${response.status}: ${text}`)
      return
    }

    let index = 0
    let inputTokens = 0
    let outputTokens = 0

    try {
      for await (const raw of this.parseSSE(response)) {
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
            modelId: params.config.id,
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
            modelId: params.config.id,
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
      console.error('[AnthropicProvider] stream error:', err)
      yield this.errorChunk(params.config.id, String(err))
    }
  }
}
