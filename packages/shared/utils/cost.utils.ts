export function estimateTokens(text: string): number {
  // Rough heuristic: ~4 characters per token for typical English text
  return Math.ceil(text.length / 4)
}

export function calculateCost(tokens: number, pricePerMillion: number): number {
  return (tokens * pricePerMillion) / 1_000_000
}

export function formatCost(usd: number): string {
  if (usd === 0) return '$0.00'
  if (usd < 0.01) return `$${usd.toExponential(2)}`
  return `$${usd.toFixed(2)}`
}
