import * as fs from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import type { KeychainService } from './KeychainService.js'

// ---------------------------------------------------------------------------
// EmbeddingProvider Interface
// ---------------------------------------------------------------------------

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>
  dimensions: number
  readonly name: string
}

// ---------------------------------------------------------------------------
// Ollama Provider (Local Ollama instance)
// ---------------------------------------------------------------------------

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'ollama'
  readonly dimensions = 768
  readonly model = 'nomic-embed-text'
  readonly baseUrl = 'http://localhost:11434'

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt: text }),
    })
    if (!res.ok) {
      throw new Error(`Ollama embeddings failed: ${res.status} ${res.statusText}`)
    }
    const data = (await res.json()) as { embedding?: number[] }
    if (!Array.isArray(data.embedding)) {
      throw new Error('Ollama embeddings response missing embedding array')
    }
    return data.embedding
  }
}

// ---------------------------------------------------------------------------
// OpenAI Provider (Cloud API)
// ---------------------------------------------------------------------------

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai'
  readonly dimensions = 1536
  readonly model = 'text-embedding-ada-002'

  constructor(private readonly apiKey: string) {}

  async embed(text: string): Promise<Array<number>> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    })
    if (!res.ok) {
      throw new Error(`OpenAI embeddings failed: ${res.status} ${res.statusText}`)
    }
    const data = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>
    }
    const embedding = data.data?.[0]?.embedding
    if (!Array.isArray(embedding)) {
      throw new Error('OpenAI embeddings response missing embedding array')
    }
    return embedding
  }
}

// ---------------------------------------------------------------------------
// Local ONNX Provider (all-MiniLM-L6-v2)
// ---------------------------------------------------------------------------
// Uses ONNX Runtime to run a local embedding model.
// Model: all-MiniLM-L6-v2 (384 dimensions, ~80MB)
// This provides fast, private, offline embeddings without external API calls.
// ---------------------------------------------------------------------------

interface OnnxRuntime {
  InferenceSession: {
    create(modelPath: string): Promise<OnnxSession>
  }
  Tensor: new (type: string, data: number[] | Int32Array, dims: number[]) => OnnxTensor
}

interface OnnxSession {
  run(inputs: Record<string, OnnxTensor>): Promise<Record<string, OnnxTensor>>
  inputNames: string[]
  outputNames: string[]
}

interface OnnxTensor {
  data: Float32Array
  dims: number[]
}

export class LocalOnnxEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'local-onnx'
  readonly dimensions = 384
  readonly modelName = 'all-MiniLM-L6-v2'
  
  private ort: OnnxRuntime | null = null
  private session: OnnxSession | null = null
  private modelPath: string = ''
  private tokenizer: Tokenizer | null = null
  private initialized = false
  private initPromise: Promise<void> | null = null

  constructor() {
    // Model will be stored in userData/models/
    const userData = app?.getPath('userData') || process.cwd()
    this.modelPath = path.join(userData, 'models', 'all-MiniLM-L6-v2', 'model.onnx')
  }

  async init(): Promise<void> {
    if (this.initialized) return
    if (this.initPromise) return this.initPromise

    this.initPromise = this.doInit()
    return this.initPromise
  }

  private async doInit(): Promise<void> {
    try {
      // Dynamic import of onnxruntime-node (optional dependency)
      const ortModule = await import('onnxruntime-node')
      this.ort = ortModule as unknown as OnnxRuntime

      // Check if model exists, download if not
      await this.ensureModel()

      // Load tokenizer (simple word-piece approximation for MiniLM)
      this.tokenizer = await this.loadTokenizer()

      // Create inference session
      this.session = await this.ort.InferenceSession.create(this.modelPath)
      
      this.initialized = true
      console.log(`[LocalOnnxEmbeddingProvider] Loaded ${this.modelName} (${this.dimensions}d)`)
    } catch (err) {
      console.error('[LocalOnnxEmbeddingProvider] Failed to initialize:', err)
      throw err
    }
  }

  private async ensureModel(): Promise<void> {
    if (fs.existsSync(this.modelPath)) {
      return
    }

    console.log('[LocalOnnxEmbeddingProvider] Model not found, downloading...')
    
    const modelDir = path.dirname(this.modelPath)
    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true })
    }

    // Download from Hugging Face
    const modelUrl = 'https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx'
    
    try {
      const response = await fetch(modelUrl)
      if (!response.ok) {
        throw new Error(`Failed to download model: ${response.status}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      fs.writeFileSync(this.modelPath, Buffer.from(arrayBuffer))
      
      console.log(`[LocalOnnxEmbeddingProvider] Downloaded model (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)}MB)`)
    } catch (err) {
      console.error('[LocalOnnxEmbeddingProvider] Failed to download model:', err)
      throw err
    }
  }

  private async loadTokenizer(): Promise<Tokenizer> {
    // For MiniLM, we need to load the tokenizer vocab
    const vocabPath = path.join(path.dirname(this.modelPath), 'vocab.txt')
    
    // Download vocab if not exists
    if (!fs.existsSync(vocabPath)) {
      const vocabUrl = 'https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/vocab.txt'
      const response = await fetch(vocabUrl)
      const text = await response.text()
      fs.writeFileSync(vocabPath, text)
    }

    const vocabText = fs.readFileSync(vocabPath, 'utf-8')
    const vocab = new Map<string, number>()
    vocabText.split('\n').forEach((token, idx) => {
      if (token) vocab.set(token, idx)
    })

    return new Tokenizer(vocab)
  }

  async embed(text: string): Promise<number[]> {
    if (!this.initialized) {
      await this.init()
    }

    if (!this.session || !this.tokenizer || !this.ort) {
      throw new Error('LocalOnnxEmbeddingProvider not initialized')
    }

    // Tokenize
    const { inputIds, attentionMask } = this.tokenizer.encode(text, 256)

    // Create tensors
    const inputTensor = new this.ort.Tensor('int64', Array.from(inputIds), [1, inputIds.length])
    const maskTensor = new this.ort.Tensor('int64', Array.from(attentionMask), [1, attentionMask.length])

    // Run inference
    const results = await this.session.run({
      input_ids: inputTensor,
      attention_mask: maskTensor,
    })

    // Extract embedding (mean pooling of last hidden state)
    const outputTensor = results[this.session.outputNames[0]]
    const embedding = this.meanPool(outputTensor.data, attentionMask)
    
    // Normalize
    return this.normalize(embedding)
  }

  private meanPool(hiddenStates: Float32Array, attentionMask: Int32Array): number[] {
    const seqLength = attentionMask.length
    const hiddenSize = this.dimensions
    const output: number[] = new Array(hiddenSize).fill(0)
    let maskSum = 0

    for (let i = 0; i < seqLength; i++) {
      const mask = attentionMask[i]
      maskSum += mask
      
      for (let j = 0; j < hiddenSize; j++) {
        output[j] += hiddenStates[i * hiddenSize + j] * mask
      }
    }

    // Divide by mask sum (mean pooling)
    if (maskSum > 0) {
      for (let j = 0; j < hiddenSize; j++) {
        output[j] /= maskSum
      }
    }

    return output
  }

  private normalize(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0))
    if (magnitude === 0) return vector
    return vector.map(val => val / magnitude)
  }

  isAvailable(): boolean {
    try {
      // Check if onnxruntime-node can be resolved
      require.resolve('onnxruntime-node')
      return true
    } catch {
      return false
    }
  }
}

// ---------------------------------------------------------------------------
// Simple Tokenizer for all-MiniLM-L6-v2
// ---------------------------------------------------------------------------

class Tokenizer {
  private vocab: Map<string, number>
  private readonly maxLength = 256
  private readonly clsTokenId = 101
  private readonly sepTokenId = 102
  private readonly padTokenId = 0

  constructor(vocab: Map<string, number>) {
    this.vocab = vocab
  }

  encode(text: string, maxLength: number = this.maxLength): { inputIds: Int32Array; attentionMask: Int32Array } {
    // Simple wordpiece tokenization
    const tokens = this.tokenize(text.toLowerCase())
    
    // Truncate if needed (reserve space for CLS and SEP)
    const maxTokens = maxLength - 2
    const truncated = tokens.slice(0, maxTokens)
    
    // Build token IDs
    const inputIds: number[] = [this.clsTokenId]
    const attentionMask: number[] = [1]
    
    for (const token of truncated) {
      inputIds.push(this.vocab.get(token) || this.vocab.get('[UNK]') || 100)
      attentionMask.push(1)
    }
    
    inputIds.push(this.sepTokenId)
    attentionMask.push(1)
    
    // Pad to maxLength
    while (inputIds.length < maxLength) {
      inputIds.push(this.padTokenId)
      attentionMask.push(0)
    }
    
    return {
      inputIds: new Int32Array(inputIds),
      attentionMask: new Int32Array(attentionMask),
    }
  }

  private tokenize(text: string): string[] {
    const tokens: string[] = []
    const words = text.split(/\s+/)
    
    for (const word of words) {
      if (!word) continue
      
      // Try to find the longest matching token in vocab
      let remaining = word
      while (remaining.length > 0) {
        let longestMatch = ''
        
        for (let len = remaining.length; len > 0; len--) {
          const prefix = remaining.slice(0, len)
          if (this.vocab.has(prefix)) {
            longestMatch = prefix
            break
          }
          // Try with ## prefix for subwords
          if (len < remaining.length && this.vocab.has('##' + prefix)) {
            longestMatch = '##' + prefix
            break
          }
        }
        
        if (longestMatch) {
          tokens.push(longestMatch)
          remaining = remaining.slice(longestMatch.startsWith('##') ? longestMatch.length - 2 : longestMatch.length)
        } else {
          // No match found, skip character
          remaining = remaining.slice(1)
        }
      }
    }
    
    return tokens
  }
}

// ---------------------------------------------------------------------------
// Embedding Service (Central registry and fallback chain)
// ---------------------------------------------------------------------------

export class EmbeddingService {
  private providers: EmbeddingProvider[] = []
  private primaryProvider: EmbeddingProvider | null = null
  private keychain!: KeychainService

  async init(): Promise<void> {
    this.keychain = ServiceRegistry.getInstance().resolve<KeychainService>(SERVICE_TOKENS.Keychain)
    
    // Try providers in order of preference
    await this.tryInitLocalProvider()
    await this.tryInitOllamaProvider()
    await this.tryInitOpenAIProvider()
    
    if (this.primaryProvider) {
      console.log(`[EmbeddingService] Using ${this.primaryProvider.name} (${this.primaryProvider.dimensions}d)`)
    } else {
      console.warn('[EmbeddingService] No embedding provider available - semantic search disabled')
    }
    
    ServiceRegistry.getInstance().register(SERVICE_TOKENS.EmbeddingProvider, this)
  }

  private async tryInitLocalProvider(): Promise<void> {
    const local = new LocalOnnxEmbeddingProvider()
    if (!local.isAvailable()) {
      console.log('[EmbeddingService] onnxruntime-node not installed, skipping local provider')
      return
    }

    try {
      await local.init()
      this.providers.push(local)
      if (!this.primaryProvider) {
        this.primaryProvider = local
      }
    } catch (err) {
      console.warn('[EmbeddingService] Local ONNX provider failed:', err)
    }
  }

  private async tryInitOllamaProvider(): Promise<void> {
    const ollama = new OllamaEmbeddingProvider()
    
    try {
      // Test connection
      await ollama.embed('test')
      this.providers.push(ollama)
      if (!this.primaryProvider) {
        this.primaryProvider = ollama
      }
    } catch {
      console.log('[EmbeddingService] Ollama not available')
    }
  }

  private async tryInitOpenAIProvider(): Promise<void> {
    const apiKey = await this.keychain.getApiKey('openai')
    if (!apiKey) {
      console.log('[EmbeddingService] No OpenAI API key, skipping OpenAI provider')
      return
    }

    const openai = new OpenAIEmbeddingProvider(apiKey)
    this.providers.push(openai)
    // Don't make primary by default (costs money)
  }

  async embed(text: string): Promise<number[]> {
    if (!this.primaryProvider) {
      throw new Error('No embedding provider available')
    }

    // Try primary first
    try {
      return await this.primaryProvider.embed(text)
    } catch (err) {
      console.warn(`[EmbeddingService] Primary provider (${this.primaryProvider.name}) failed:`, err)
      
      // Try fallbacks
      for (const provider of this.providers) {
        if (provider === this.primaryProvider) continue
        
        try {
          const result = await provider.embed(text)
          console.log(`[EmbeddingService] Fallback to ${provider.name} succeeded`)
          return result
        } catch (fallbackErr) {
          console.warn(`[EmbeddingService] Fallback ${provider.name} failed:`, fallbackErr)
        }
      }
      
      throw new Error('All embedding providers failed')
    }
  }

  getProvider(): EmbeddingProvider | null {
    return this.primaryProvider
  }

  get dimensions(): number {
    return this.primaryProvider?.dimensions || 0
  }

  isAvailable(): boolean {
    return this.primaryProvider !== null
  }

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'embedding:getDimensions': () => this.dimensions,
      'embedding:isAvailable': () => this.isAvailable(),
      'embedding:getProvider': () => this.primaryProvider?.name || null,
    }
  }
}

// For backward compatibility - export the service as the provider
type EmbeddingServiceType = EmbeddingService
export { EmbeddingService as DefaultEmbeddingProvider }
