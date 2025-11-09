/**
 * Semantic Cache Service
 * Handles embedding generation and semantic similarity search
 */

import OpenAI from 'openai'
import { getSupabaseClient } from './supabase-client.js'
import { logger } from './logger.js'
import { recordEmbeddingUsage, recordCacheHit } from './ai-usage-tracker.js'
import { estimateTokens } from './ai-cost-calculator.js'
import { ParsedIntent } from '../types.js'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Configuration
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536
const SIMILARITY_THRESHOLD = 0.85 // Cosine similarity threshold for cache hits

export interface CacheResult {
  hit: boolean
  intent?: ParsedIntent
  similarity?: number
  messageText?: string
  embeddingId?: string
}

/**
 * Generate embedding vector for a text message
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS
  })
  
  return response.data[0].embedding
}

/**
 * Search for similar messages in the cache
 */
export async function searchSimilarMessages(
  userId: string,
  messageText: string
): Promise<CacheResult> {
  const startTime = Date.now()
  
  try {
    // Generate embedding for the query message
    const embedding = await generateEmbedding(messageText)
    
    // Track embedding cost
    const tokens = estimateTokens(messageText)
    await recordEmbeddingUsage(userId, tokens)
    
    // Search for similar messages using the database function
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.rpc('find_similar_messages', {
      p_user_id: userId,
      p_embedding: JSON.stringify(embedding),
      p_similarity_threshold: SIMILARITY_THRESHOLD,
      p_limit: 1
    })
    
    if (error) {
      logger.error('Error searching similar messages', { userId }, error)
      return { hit: false }
    }
    
    if (!data || data.length === 0) {
      logger.debug('No similar messages found in cache', {
        userId,
        messageText,
        duration: Date.now() - startTime
      })
      return { hit: false }
    }
    
    // Cache hit!
    const match = data[0]
    await recordCacheHit(userId)
    
    // Update usage statistics for this cached entry
    await supabase.rpc('update_embedding_usage', {
      p_embedding_id: match.id
    })
    
    logger.info('Cache hit!', {
      userId,
      messageText,
      cachedMessage: match.message_text,
      similarity: match.similarity,
      duration: Date.now() - startTime
    })
    
    return {
      hit: true,
      intent: match.parsed_intent as ParsedIntent,
      similarity: match.similarity,
      messageText: match.message_text,
      embeddingId: match.id
    }
  } catch (error) {
    logger.error('Error in semantic cache search', { userId, messageText }, error as Error)
    return { hit: false }
  }
}

/**
 * Store a new message embedding in the cache
 */
export async function storeMessageEmbedding(
  userId: string,
  messageText: string,
  parsedIntent: ParsedIntent
): Promise<boolean> {
  try {
    // Generate embedding for the message
    const embedding = await generateEmbedding(messageText)
    
    // Store in database
    const supabase = getSupabaseClient()
    const { error } = await supabase
      .from('message_embeddings')
      .insert({
        user_id: userId,
        message_text: messageText,
        embedding: JSON.stringify(embedding),
        parsed_intent: parsedIntent,
        created_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
        usage_count: 1
      })
    
    if (error) {
      logger.error('Error storing message embedding', { userId, messageText }, error)
      return false
    }
    
    logger.debug('Message embedding stored', { userId, messageText })
    return true
  } catch (error) {
    logger.error('Exception storing message embedding', { userId, messageText }, error as Error)
    return false
  }
}

/**
 * Check cache and return result or null for cache miss
 * This is the main entry point for the semantic cache
 */
export async function checkCache(
  userId: string,
  messageText: string
): Promise<ParsedIntent | null> {
  const result = await searchSimilarMessages(userId, messageText)
  
  if (result.hit && result.intent) {
    return result.intent
  }
  
  return null
}

/**
 * Store successful parse result in cache
 */
export async function saveToCache(
  userId: string,
  messageText: string,
  parsedIntent: ParsedIntent
): Promise<void> {
  // Store asynchronously, don't wait for completion
  storeMessageEmbedding(userId, messageText, parsedIntent).catch(error => {
    logger.error('Background cache save failed', { userId, messageText }, error)
  })
}

/**
 * Clear old cache entries (cleanup function)
 * Can be called periodically to remove unused embeddings
 */
export async function cleanupOldEmbeddings(
  daysOld: number = 90,
  minUsageCount: number = 1
): Promise<number> {
  const supabase = getSupabaseClient()
  
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysOld)
    
    const { data, error } = await supabase
      .from('message_embeddings')
      .delete()
      .lt('last_used_at', cutoffDate.toISOString())
      .lt('usage_count', minUsageCount)
      .select('id')
    
    if (error) {
      logger.error('Error cleaning up old embeddings', {}, error)
      return 0
    }
    
    const deletedCount = data?.length || 0
    logger.info('Cleaned up old embeddings', { deletedCount, daysOld, minUsageCount })
    return deletedCount
  } catch (error) {
    logger.error('Exception cleaning up embeddings', {}, error as Error)
    return 0
  }
}

