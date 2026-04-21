export enum ModelProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  MISTRAL = 'mistral',
  COHERE = 'cohere',
  LOCAL = 'local',
  OPENROUTER = 'openrouter',
  CUSTOM = 'custom'
}

export type ModelId = string

export enum ModelCapability {
  CHAT = 'chat',
  COMPLETION = 'completion',
  EMBEDDING = 'embedding',
  IMAGE_GENERATION = 'image_generation',
  VISION = 'vision',
  FUNCTION_CALLING = 'function_calling',
  CODE = 'code',
  REASONING = 'reasoning',
  STREAMING = 'streaming'
}

export interface ModelConfig {
  id: ModelId
  provider: ModelProvider
  name: string
  capabilities: ModelCapability[]
  contextWindow: number
  maxTokens: number
  temperature?: number
  topP?: number
  apiKeyEnvVar?: string
  baseUrl?: string
}

export interface StreamChunk {
  id: string
  modelId: ModelId
  content: string
  index: number
  isDone: boolean
  finishReason?: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}
