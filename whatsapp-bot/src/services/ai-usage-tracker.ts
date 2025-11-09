/**
 * AI Usage Tracker Service
 * Tracks and enforces AI API usage limits per user
 */

import { getSupabaseClient } from './supabase-client.js'
import { calculateLLMCost, calculateEmbeddingCost, type TokenUsage } from './ai-cost-calculator.js'
import { logger } from './logger.js'

export interface UsageStats {
  dailyCostUsd: number
  dailyLimitUsd: number
  remainingBudgetUsd: number
  llmCallsToday: number
  embeddingCallsToday: number
  cacheHitsToday: number
  cacheHitRate: number
  isLimitExceeded: boolean
}

export interface UsageCheckResult {
  allowed: boolean
  reason?: string
  currentUsage?: UsageStats
}

/**
 * Check if user can make an AI API call without exceeding daily limit
 */
export async function checkDailyLimit(userId: string): Promise<UsageCheckResult> {
  const supabase = getSupabaseClient()
  
  try {
    // Call the database function to check limit
    const { data, error } = await supabase.rpc('check_daily_limit', {
      p_user_id: userId
    })
    
    if (error) {
      logger.error('Error checking daily limit', { userId }, error)
      // On error, allow the call but log it
      return { allowed: true, reason: 'Error checking limit, defaulting to allow' }
    }
    
    if (!data) {
      // User can proceed (limit not exceeded)
      return { allowed: true }
    }
    
    // Get current usage stats
    const stats = await getUserUsageStats(userId)
    
    if (stats && stats.isLimitExceeded) {
      return {
        allowed: false,
        reason: 'Daily limit exceeded',
        currentUsage: stats
      }
    }
    
    return { allowed: true, currentUsage: stats }
  } catch (error) {
    logger.error('Exception in checkDailyLimit', { userId }, error as Error)
    // On exception, allow the call but log it
    return { allowed: true, reason: 'Exception during limit check, defaulting to allow' }
  }
}

/**
 * Record LLM API usage
 */
export async function recordLLMUsage(
  userId: string,
  usage: TokenUsage
): Promise<void> {
  const supabase = getSupabaseClient()
  const costBreakdown = calculateLLMCost(usage)
  
  try {
    const { error } = await supabase.rpc('record_ai_usage', {
      p_user_id: userId,
      p_cost_usd: costBreakdown.totalCost,
      p_call_type: 'llm',
      p_input_tokens: usage.inputTokens,
      p_output_tokens: usage.outputTokens
    })
    
    if (error) {
      logger.error('Error recording LLM usage', { userId, usage, cost: costBreakdown.totalCost }, error)
    } else {
      logger.debug('LLM usage recorded', {
        userId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cost: costBreakdown.totalCost
      })
    }
  } catch (error) {
    logger.error('Exception recording LLM usage', { userId }, error as Error)
  }
}

/**
 * Record embedding API usage
 */
export async function recordEmbeddingUsage(
  userId: string,
  tokens: number
): Promise<void> {
  const supabase = getSupabaseClient()
  const cost = calculateEmbeddingCost(tokens)
  
  try {
    const { error } = await supabase.rpc('record_ai_usage', {
      p_user_id: userId,
      p_cost_usd: cost,
      p_call_type: 'embedding',
      p_input_tokens: tokens,
      p_output_tokens: 0
    })
    
    if (error) {
      logger.error('Error recording embedding usage', { userId, tokens, cost }, error)
    } else {
      logger.debug('Embedding usage recorded', { userId, tokens, cost })
    }
  } catch (error) {
    logger.error('Exception recording embedding usage', { userId }, error as Error)
  }
}

/**
 * Record cache hit (no cost, but tracked for analytics)
 */
export async function recordCacheHit(userId: string): Promise<void> {
  const supabase = getSupabaseClient()
  
  try {
    const { error } = await supabase.rpc('record_ai_usage', {
      p_user_id: userId,
      p_cost_usd: 0,
      p_call_type: 'cache_hit',
      p_input_tokens: 0,
      p_output_tokens: 0
    })
    
    if (error) {
      logger.error('Error recording cache hit', { userId }, error)
    } else {
      logger.debug('Cache hit recorded', { userId })
    }
  } catch (error) {
    logger.error('Exception recording cache hit', { userId }, error as Error)
  }
}

/**
 * Get user's current usage statistics
 */
export async function getUserUsageStats(userId: string): Promise<UsageStats | undefined> {
  const supabase = getSupabaseClient()
  
  try {
    const { data, error } = await supabase.rpc('get_user_usage_stats', {
      p_user_id: userId
    })
    
    if (error) {
      logger.error('Error getting user usage stats', { userId }, error)
      return undefined
    }
    
    if (!data || data.length === 0) {
      // No usage record yet, return defaults
      return {
        dailyCostUsd: 0,
        dailyLimitUsd: 1.0,
        remainingBudgetUsd: 1.0,
        llmCallsToday: 0,
        embeddingCallsToday: 0,
        cacheHitsToday: 0,
        cacheHitRate: 0,
        isLimitExceeded: false
      }
    }
    
    const stats = data[0]
    return {
      dailyCostUsd: parseFloat(stats.daily_cost_usd),
      dailyLimitUsd: parseFloat(stats.daily_limit_usd),
      remainingBudgetUsd: parseFloat(stats.remaining_budget_usd),
      llmCallsToday: stats.llm_calls_today,
      embeddingCallsToday: stats.embedding_calls_today,
      cacheHitsToday: stats.cache_hits_today,
      cacheHitRate: parseFloat(stats.cache_hit_rate),
      isLimitExceeded: stats.is_limit_exceeded
    }
  } catch (error) {
    logger.error('Exception getting user usage stats', { userId }, error as Error)
    return undefined
  }
}

/**
 * Update user's daily limit (admin function)
 */
export async function updateDailyLimit(
  userId: string,
  newLimitUsd: number
): Promise<boolean> {
  const supabase = getSupabaseClient()
  
  try {
    const { error } = await supabase
      .from('user_ai_usage')
      .upsert({
        user_id: userId,
        daily_limit_usd: newLimitUsd,
        last_updated: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })
    
    if (error) {
      logger.error('Error updating daily limit', { userId, newLimitUsd }, error)
      return false
    }
    
    logger.info('Daily limit updated', { userId, newLimitUsd })
    return true
  } catch (error) {
    logger.error('Exception updating daily limit', { userId }, error as Error)
    return false
  }
}

/**
 * Enable or disable limit enforcement for a user (admin function)
 */
export async function setLimitEnabled(
  userId: string,
  enabled: boolean
): Promise<boolean> {
  const supabase = getSupabaseClient()
  
  try {
    const { error } = await supabase
      .from('user_ai_usage')
      .upsert({
        user_id: userId,
        is_limit_enabled: enabled,
        last_updated: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })
    
    if (error) {
      logger.error('Error setting limit enabled status', { userId, enabled }, error)
      return false
    }
    
    logger.info('Limit enabled status updated', { userId, enabled })
    return true
  } catch (error) {
    logger.error('Exception setting limit enabled', { userId }, error as Error)
    return false
  }
}

