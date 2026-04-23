import { randomUUID } from 'crypto'
import { AgentRole, type ModelId, type ModelConfig, type StreamChunk } from '@nexusmind/shared'
import type { AgentMessage } from '@nexusmind/shared'
import type { KeychainService } from '../KeychainService.js'

export type ModelDefinition = ModelConfig
export type Message = AgentMessage

export interface CompletionParams {
  config: ModelConfig
  messages: AgentMessage[]
  apiKey: string | null
}

export abstract class BaseProvider {
  abstract readonly name: string
  abstract readonly knownModels: ModelDefinition[]

  constructor(protected keychain: KeychainService) {}

  abstract streamCompletion(params: CompletionParams): AsyncIterable<StreamChunk>

  protected async *parseSSE(response: Response): AsyncGenerator<string> {
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

  protected injectSystemContext(messages: Message[], context: string): Message[] {
    if (!context) return messages

    const systemMessage: Message = {
      id: randomUUID(),
      agentId: 'system',
      role: AgentRole.SYSTEM,
      content: context,
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

  protected errorChunk(modelId: ModelId, message: string): StreamChunk {
    return {
      id: randomUUID(),
      modelId,
      content: message,
      index: 0,
      isDone: true,
      finishReason: 'error',
    }
  }
}
