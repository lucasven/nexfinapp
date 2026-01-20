/**
 * AI Cost Calculator Service
 * Calculates costs for OpenAI API usage
 */

// OpenAI pricing (as of January 2026)
const PRICING = {
  // GPT-5 pricing per 1M tokens
  GPT5: {
    INPUT: 1.25,   // $1.25 per 1M input tokens
    OUTPUT: 10.00  // $10.00 per 1M output tokens
  },
  // text-embedding-3-small pricing per 1M tokens
  EMBEDDING_SMALL: 0.020 // $0.020 per 1M tokens
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

export interface CostBreakdown {
  inputCost: number
  outputCost: number
  totalCost: number
}

/**
 * Calculate cost for GPT-5 API call
 */
export function calculateLLMCost(usage: TokenUsage): CostBreakdown {
  const inputCost = (usage.inputTokens / 1_000_000) * PRICING.GPT5.INPUT
  const outputCost = (usage.outputTokens / 1_000_000) * PRICING.GPT5.OUTPUT
  const totalCost = inputCost + outputCost
  
  return {
    inputCost,
    outputCost,
    totalCost
  }
}

/**
 * Calculate cost for text-embedding-3-small API call
 */
export function calculateEmbeddingCost(tokens: number): number {
  return (tokens / 1_000_000) * PRICING.EMBEDDING_SMALL
}

/**
 * Estimate tokens for a text string
 * Rule of thumb: ~4 characters per token for English, ~2-3 for Portuguese
 * This is an approximation - actual tokenization may vary
 */
export function estimateTokens(text: string): number {
  // Conservative estimate: 3 characters per token for Portuguese
  return Math.ceil(text.length / 3)
}

/**
 * Format cost as USD string
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(6)}`
}

/**
 * Format cost in cents for display
 */
export function formatCostInCents(cost: number): string {
  const cents = cost * 100
  if (cents < 0.01) {
    return '<$0.01'
  }
  return `$${cents.toFixed(2)}`
}


