"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { verifyAdmin } from "./auth"

/**
 * Get intent distribution - which commands are being used
 */
export async function getIntentDistribution() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: intents } = await supabase
    .from("parsing_metrics")
    .select("intent_action, success")
    .not("intent_action", "is", null)

  const intentCounts = new Map<string, { total: number; successful: number; failed: number }>()

  intents?.forEach((i: any) => {
    const intent = i.intent_action || "unknown"
    const stats = intentCounts.get(intent) || { total: 0, successful: 0, failed: 0 }

    stats.total++
    if (i.success) stats.successful++
    else stats.failed++

    intentCounts.set(intent, stats)
  })

  const total = intents?.length || 0
  return Array.from(intentCounts.entries())
    .map(([intent, stats]) => ({
      intent,
      total: stats.total,
      successful: stats.successful,
      failed: stats.failed,
      successRate: Number(((stats.successful / stats.total) * 100).toFixed(2)),
      percentage: total > 0 ? Number(((stats.total / total) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.total - a.total)
}

/**
 * Get entity extraction patterns - what entities are being extracted
 */
export async function getEntityExtractionPatterns() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: metrics } = await supabase
    .from("parsing_metrics")
    .select("intent_action, intent_entities, success")
    .not("intent_entities", "is", null)
    .limit(1000)

  const entityStats = new Map<string, Map<string, number>>()

  metrics?.forEach((m: any) => {
    const intent = m.intent_action || "unknown"
    if (!entityStats.has(intent)) {
      entityStats.set(intent, new Map())
    }

    const entities = m.intent_entities as Record<string, any>
    Object.keys(entities || {}).forEach(entityKey => {
      const intentEntityMap = entityStats.get(intent)!
      intentEntityMap.set(entityKey, (intentEntityMap.get(entityKey) || 0) + 1)
    })
  })

  const result: any[] = []
  entityStats.forEach((entityMap, intent) => {
    entityMap.forEach((count, entityType) => {
      result.push({
        intent,
        entityType,
        count,
        percentage: metrics ? Number(((count / metrics.length) * 100).toFixed(1)) : 0,
      })
    })
  })

  return result.sort((a, b) => b.count - a.count)
}

/**
 * Get command coverage - which commands exist but aren't being used
 */
export async function getCommandCoverage() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const allIntents = [
    'add_expense', 'add_income', 'show_expenses', 'edit_transaction', 'delete_transaction',
    'change_category', 'show_transaction_details', 'set_budget', 'show_budget', 'delete_budget',
    'add_recurring', 'show_recurring', 'delete_recurring', 'edit_recurring', 'make_expense_recurring',
    'show_report', 'search_transactions', 'quick_stats', 'analyze_spending',
    'list_categories', 'add_category', 'remove_category',
    'login', 'logout', 'help', 'show_help', 'undo_last', 'unknown'
  ]

  const { data: usedIntents } = await supabase
    .from("parsing_metrics")
    .select("intent_action")
    .not("intent_action", "is", null)

  const usageCounts = new Map<string, number>()
  usedIntents?.forEach((i: any) => {
    const intent = i.intent_action
    usageCounts.set(intent, (usageCounts.get(intent) || 0) + 1)
  })

  return allIntents.map(intent => ({
    intent,
    usageCount: usageCounts.get(intent) || 0,
    isUsed: usageCounts.has(intent),
  })).sort((a, b) => b.usageCount - a.usageCount)
}

/**
 * Get misclassified intents that need review
 */
export async function getMisclassifiedIntents(limit: number = 50) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: misclassifications } = await supabase
    .from("intent_misclassifications")
    .select(`
      id,
      original_intent,
      corrected_intent,
      original_message,
      correction_method,
      time_to_correction_seconds,
      severity,
      created_at,
      resolved
    `)
    .order("created_at", { ascending: false })
    .limit(limit)

  return misclassifications || []
}

/**
 * Get cache effectiveness for intent parsing
 */
export async function getIntentCacheEffectiveness() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: metrics } = await supabase
    .from("parsing_metrics")
    .select("cache_hit, cache_similarity, success, intent_action")

  const cacheHits = metrics?.filter(m => m.cache_hit === true) || []
  const totalMessages = metrics?.length || 0

  const intentCacheStats = new Map<string, { cacheHits: number; total: number }>()

  metrics?.forEach((m: any) => {
    const intent = m.intent_action || "unknown"
    const stats = intentCacheStats.get(intent) || { cacheHits: 0, total: 0 }

    stats.total++
    if (m.cache_hit) stats.cacheHits++

    intentCacheStats.set(intent, stats)
  })

  const avgSimilarity = cacheHits.length > 0
    ? cacheHits.reduce((sum, m) => sum + (m.cache_similarity || 0), 0) / cacheHits.length
    : 0

  return {
    totalCacheHits: cacheHits.length,
    totalMessages,
    cacheHitRate: totalMessages > 0 ? Number(((cacheHits.length / totalMessages) * 100).toFixed(2)) : 0,
    avgSimilarity: Number((avgSimilarity * 100).toFixed(2)),
    byIntent: Array.from(intentCacheStats.entries()).map(([intent, stats]) => ({
      intent,
      cacheHits: stats.cacheHits,
      total: stats.total,
      cacheHitRate: stats.total > 0 ? Number(((stats.cacheHits / stats.total) * 100).toFixed(2)) : 0,
    })).sort((a, b) => b.total - a.total),
  }
}

/**
 * Get retry/rephrase patterns - messages that failed then succeeded
 */
export async function getRetryPatterns() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: failedMetrics } = await supabase
    .from("parsing_metrics")
    .select("user_id, whatsapp_number, message_text, intent_action, created_at")
    .eq("success", false)
    .order("created_at", { ascending: false })
    .limit(100)

  if (!failedMetrics || failedMetrics.length === 0) {
    return []
  }

  const retryPatterns: any[] = []

  for (const failed of failedMetrics) {
    const twoMinutesLater = new Date(failed.created_at)
    twoMinutesLater.setMinutes(twoMinutesLater.getMinutes() + 2)

    const { data: successfulMetrics } = await supabase
      .from("parsing_metrics")
      .select("message_text, intent_action, created_at")
      .eq("user_id", failed.user_id)
      .eq("success", true)
      .gte("created_at", failed.created_at)
      .lte("created_at", twoMinutesLater.toISOString())
      .order("created_at", { ascending: true })
      .limit(1)

    if (successfulMetrics && successfulMetrics.length > 0) {
      const successful = successfulMetrics[0]
      const timeDiff = new Date(successful.created_at).getTime() - new Date(failed.created_at).getTime()

      retryPatterns.push({
        failedMessage: failed.message_text,
        failedIntent: failed.intent_action,
        successfulMessage: successful.message_text,
        successfulIntent: successful.intent_action,
        retryTimeSeconds: Math.round(timeDiff / 1000),
        userId: failed.user_id,
      })
    }
  }

  return retryPatterns.slice(0, 20)
}
