/**
 * Metrics tracking service for monitoring parsing strategies and performance
 * 
 * This service records metrics about message parsing, including:
 * - Which strategy was used to parse each message
 * - Success/failure rates per strategy
 * - Performance metrics (parse time, execution time)
 * - Permission checks
 */

import { getSupabaseClient } from './supabase-client.js'
import { logger } from './logger.js'

export type MessageType = 'text' | 'image' | 'command'

export type ParsingStrategy =
  | 'correction_state'
  | 'duplicate_confirmation'
  | 'correction_intent'
  | 'explicit_command'
  | 'learned_pattern'
  | 'local_nlp'
  | 'semantic_cache'
  | 'ai_pattern'
  | 'ai_function_calling'
  | 'unknown'

export interface ParsingMetric {
  userId?: string
  whatsappNumber: string
  messageText: string
  messageType: MessageType
  strategyUsed: ParsingStrategy
  intentAction?: string
  confidence?: number
  success: boolean
  errorMessage?: string
  parseDurationMs?: number
  executionDurationMs?: number
  permissionRequired?: string
  permissionGranted?: boolean
}

export interface StrategyStats {
  strategy: ParsingStrategy
  totalCount: number
  successCount: number
  failureCount: number
  successRate: number
  avgParseDuration: number
  avgExecutionDuration: number
}

/**
 * Record a parsing metric to the database
 */
export async function recordParsingMetric(metric: ParsingMetric): Promise<void> {
  try {
    const supabase = getSupabaseClient()
    
    const { error } = await supabase
      .from('parsing_metrics')
      .insert({
        user_id: metric.userId || null,
        whatsapp_number: metric.whatsappNumber,
        message_text: metric.messageText,
        message_type: metric.messageType,
        strategy_used: metric.strategyUsed,
        intent_action: metric.intentAction || null,
        confidence: metric.confidence || null,
        success: metric.success,
        error_message: metric.errorMessage || null,
        parse_duration_ms: metric.parseDurationMs || null,
        execution_duration_ms: metric.executionDurationMs || null,
        permission_required: metric.permissionRequired || null,
        permission_granted: metric.permissionGranted || null
      })

    if (error) {
      logger.error('Failed to record parsing metric', { error: error.message })
    }
  } catch (error) {
    // Don't throw - metrics should never break the main flow
    logger.error('Error recording parsing metric', error as Error)
  }
}

/**
 * Get success rate for a specific strategy
 */
export async function getStrategySuccessRate(
  strategy?: ParsingStrategy,
  userId?: string
): Promise<number> {
  try {
    const supabase = getSupabaseClient()
    
    let query = supabase
      .from('parsing_metrics')
      .select('success')

    if (strategy) {
      query = query.eq('strategy_used', strategy)
    }

    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data, error } = await query

    if (error) {
      logger.error('Failed to get strategy success rate', { error: error.message })
      return 0
    }

    if (!data || data.length === 0) {
      return 0
    }

    const successCount = data.filter(m => m.success).length
    return successCount / data.length
  } catch (error) {
    logger.error('Error getting strategy success rate', error as Error)
    return 0
  }
}

/**
 * Get average parse time for a strategy
 */
export async function getAverageParseTime(
  strategy?: ParsingStrategy
): Promise<number> {
  try {
    const supabase = getSupabaseClient()
    
    let query = supabase
      .from('parsing_metrics')
      .select('parse_duration_ms')
      .not('parse_duration_ms', 'is', null)

    if (strategy) {
      query = query.eq('strategy_used', strategy)
    }

    const { data, error } = await query

    if (error) {
      logger.error('Failed to get average parse time', { error: error.message })
      return 0
    }

    if (!data || data.length === 0) {
      return 0
    }

    const total = data.reduce((sum, m) => sum + (m.parse_duration_ms || 0), 0)
    return total / data.length
  } catch (error) {
    logger.error('Error getting average parse time', error as Error)
    return 0
  }
}

/**
 * Get comprehensive statistics for all strategies
 */
export async function getStrategyStatistics(
  userId?: string,
  startDate?: Date,
  endDate?: Date
): Promise<StrategyStats[]> {
  try {
    const supabase = getSupabaseClient()
    
    let query = supabase
      .from('parsing_metrics')
      .select('*')

    if (userId) {
      query = query.eq('user_id', userId)
    }

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString())
    }

    if (endDate) {
      query = query.lte('created_at', endDate.toISOString())
    }

    const { data, error } = await query

    if (error) {
      logger.error('Failed to get strategy statistics', { error: error.message })
      return []
    }

    if (!data || data.length === 0) {
      return []
    }

    // Group by strategy
    const strategyGroups = new Map<ParsingStrategy, typeof data>()
    
    data.forEach(metric => {
      const strategy = metric.strategy_used as ParsingStrategy
      if (!strategyGroups.has(strategy)) {
        strategyGroups.set(strategy, [])
      }
      strategyGroups.get(strategy)!.push(metric)
    })

    // Calculate stats for each strategy
    const stats: StrategyStats[] = []

    strategyGroups.forEach((metrics, strategy) => {
      const totalCount = metrics.length
      const successCount = metrics.filter(m => m.success).length
      const failureCount = totalCount - successCount
      const successRate = successCount / totalCount

      const parseDurations = metrics
        .filter(m => m.parse_duration_ms !== null)
        .map(m => m.parse_duration_ms!)
      const avgParseDuration = parseDurations.length > 0
        ? parseDurations.reduce((sum, d) => sum + d, 0) / parseDurations.length
        : 0

      const executionDurations = metrics
        .filter(m => m.execution_duration_ms !== null)
        .map(m => m.execution_duration_ms!)
      const avgExecutionDuration = executionDurations.length > 0
        ? executionDurations.reduce((sum, d) => sum + d, 0) / executionDurations.length
        : 0

      stats.push({
        strategy,
        totalCount,
        successCount,
        failureCount,
        successRate,
        avgParseDuration,
        avgExecutionDuration
      })
    })

    return stats.sort((a, b) => b.totalCount - a.totalCount)
  } catch (error) {
    logger.error('Error getting strategy statistics', error as Error)
    return []
  }
}

/**
 * Get recent failed parsing attempts for debugging
 */
export async function getRecentFailures(
  limit: number = 10,
  userId?: string
): Promise<ParsingMetric[]> {
  try {
    const supabase = getSupabaseClient()
    
    let query = supabase
      .from('parsing_metrics')
      .select('*')
      .eq('success', false)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data, error } = await query

    if (error) {
      logger.error('Failed to get recent failures', { error: error.message })
      return []
    }

    return (data || []).map(d => ({
      userId: d.user_id,
      whatsappNumber: d.whatsapp_number,
      messageText: d.message_text,
      messageType: d.message_type as MessageType,
      strategyUsed: d.strategy_used as ParsingStrategy,
      intentAction: d.intent_action,
      confidence: d.confidence,
      success: d.success,
      errorMessage: d.error_message,
      parseDurationMs: d.parse_duration_ms,
      executionDurationMs: d.execution_duration_ms,
      permissionRequired: d.permission_required,
      permissionGranted: d.permission_granted
    }))
  } catch (error) {
    logger.error('Error getting recent failures', error as Error)
    return []
  }
}

/**
 * Get metrics for a specific user's recent messages
 */
export async function getUserRecentMetrics(
  userId: string,
  limit: number = 20
): Promise<ParsingMetric[]> {
  try {
    const supabase = getSupabaseClient()
    
    const { data, error } = await supabase
      .from('parsing_metrics')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      logger.error('Failed to get user recent metrics', { error: error.message })
      return []
    }

    return (data || []).map(d => ({
      userId: d.user_id,
      whatsappNumber: d.whatsapp_number,
      messageText: d.message_text,
      messageType: d.message_type as MessageType,
      strategyUsed: d.strategy_used as ParsingStrategy,
      intentAction: d.intent_action,
      confidence: d.confidence,
      success: d.success,
      errorMessage: d.error_message,
      parseDurationMs: d.parse_duration_ms,
      executionDurationMs: d.execution_duration_ms,
      permissionRequired: d.permission_required,
      permissionGranted: d.permission_granted
    }))
  } catch (error) {
    logger.error('Error getting user recent metrics', error as Error)
    return []
  }
}

