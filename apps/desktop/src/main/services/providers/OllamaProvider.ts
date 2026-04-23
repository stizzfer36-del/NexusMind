import { randomUUID } from 'crypto'
import { ModelCapability, ModelProvider, type StreamChunk } from '@nexusmind/shared'
import type { ModelConfig } from '@nexusmind/shared'
import { BaseProvider, type CompletionParams } from './BaseProvider.js'

const OLLAMA_MODELS: ModelConfig[] = [
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
]

export class OllamaProvider extends BaseProvider {
  readonly name = ModelProvider.LOCAL
  readonly knownModels = OLLAMA_MODELS

  async *streamCompletion(params: CompletionParams): AsyncGenerator<StreamChunk> {
    const baseUrl = params.config.baseUrl ?? 'http://localhost:11434'
    const ollamaMessages = params.messages.map((m) => ({ role: m.role, content: m.content }))

    let response: Response
    try {
      response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: params.config.id,
          messages: ollamaMessages,
          stream: true,
          options: {
            temperature: params.config.temperature,
            top_p: params.config.topP,
            num_predict: params.config.maxTokens,
          },
        }),
      })
    } catch (err) {
      console.error('[OllamaProvider] fetch error:', err)
      yield this.errorChunk(params.config.id, String(err))
      return
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText)
      console.error('[OllamaProvider] API error:', response.status, text)
      yield this.errorChunk(params.config.id, `Ollama API error ${response.status}: ${text}`)
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
            modelId: params.config.id,
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
      console.error('[OllamaProvider] stream error:', err)
      yield this.errorChunk(params.config.id, String(err))
    }
  }
}
