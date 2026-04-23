export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>
  dimensions: number
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
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

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 1536
  readonly model = 'text-embedding-ada-002'

  constructor(private readonly apiKey: string) {}

  async embed(text: string): Promise<number[]> {
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
