"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { verifyAdmin } from "./auth"

/**
 * Get OCR matching statistics overview
 */
export async function getOCRMatchingStats() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { count: totalOCRMessages } = await supabase
    .from("parsing_metrics")
    .select("*", { count: "exact", head: true })
    .eq("message_type", "image")

  const { count: successfulOCR } = await supabase
    .from("parsing_metrics")
    .select("*", { count: "exact", head: true })
    .eq("message_type", "image")
    .eq("success", true)

  const { data: ocrConfidenceData } = await supabase
    .from("parsing_metrics")
    .select("confidence")
    .eq("message_type", "image")
    .not("confidence", "is", null)

  const avgOCRConfidence = ocrConfidenceData && ocrConfidenceData.length > 0
    ? ocrConfidenceData.reduce((sum, row) => sum + Number(row.confidence || 0), 0) / ocrConfidenceData.length
    : 0

  const { data: ocrTimingData } = await supabase
    .from("parsing_metrics")
    .select("parse_duration_ms")
    .eq("message_type", "image")
    .not("parse_duration_ms", "is", null)

  const avgOCRProcessingTime = ocrTimingData && ocrTimingData.length > 0
    ? ocrTimingData.reduce((sum, row) => sum + Number(row.parse_duration_ms || 0), 0) / ocrTimingData.length
    : 0

  const ocrSuccessRate = totalOCRMessages && totalOCRMessages > 0
    ? ((successfulOCR || 0) / totalOCRMessages) * 100
    : 0

  return {
    totalOCRMessages: totalOCRMessages || 0,
    successfulOCR: successfulOCR || 0,
    ocrSuccessRate: Number(ocrSuccessRate.toFixed(2)),
    avgOCRConfidence: Number((avgOCRConfidence * 100).toFixed(2)),
    avgOCRProcessingTime: Number(avgOCRProcessingTime.toFixed(0)),
  }
}

/**
 * Get NLP strategy performance breakdown
 */
export async function getNLPStrategyPerformance() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: metrics } = await supabase
    .from("parsing_metrics")
    .select("strategy_used, success, confidence, parse_duration_ms")
    .not("strategy_used", "is", null)

  const strategyStats = new Map<string, {
    total: number
    successful: number
    totalConfidence: number
    totalDuration: number
  }>()

  metrics?.forEach((m: any) => {
    const strategy = m.strategy_used
    const stats = strategyStats.get(strategy) || {
      total: 0,
      successful: 0,
      totalConfidence: 0,
      totalDuration: 0,
    }

    stats.total++
    if (m.success) stats.successful++
    stats.totalConfidence += Number(m.confidence || 0)
    stats.totalDuration += Number(m.parse_duration_ms || 0)

    strategyStats.set(strategy, stats)
  })

  return Array.from(strategyStats.entries()).map(([strategy, stats]) => ({
    strategy,
    total: stats.total,
    successful: stats.successful,
    successRate: Number(((stats.successful / stats.total) * 100).toFixed(2)),
    avgConfidence: Number(((stats.totalConfidence / stats.total) * 100).toFixed(2)),
    avgDuration: Number((stats.totalDuration / stats.total).toFixed(0)),
  })).sort((a, b) => b.total - a.total)
}

/**
 * Get cache hit rate statistics
 */
export async function getCacheHitRateStats() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: aiUsageData } = await supabase
    .from("user_ai_usage")
    .select("llm_calls_count, cache_hits_count, total_cost_usd")

  const totalLLMCalls = aiUsageData?.reduce(
    (sum, row) => sum + Number(row.llm_calls_count || 0),
    0
  ) || 0

  const totalCacheHits = aiUsageData?.reduce(
    (sum, row) => sum + Number(row.cache_hits_count || 0),
    0
  ) || 0

  const totalCost = aiUsageData?.reduce(
    (sum, row) => sum + Number(row.total_cost_usd || 0),
    0
  ) || 0

  const totalCallsWithCache = totalLLMCalls + totalCacheHits
  const cacheHitRate = totalCallsWithCache > 0
    ? (totalCacheHits / totalCallsWithCache) * 100
    : 0

  const estimatedSavings = totalCacheHits * 0.01

  const { data: cachedMessages } = await supabase
    .from("message_embeddings")
    .select("message_text, usage_count")
    .order("usage_count", { ascending: false })
    .limit(10)

  return {
    totalLLMCalls,
    totalCacheHits,
    cacheHitRate: Number(cacheHitRate.toFixed(2)),
    totalCost: Number(totalCost.toFixed(4)),
    estimatedSavings: Number(estimatedSavings.toFixed(4)),
    topCachedPatterns: cachedMessages?.map((m: any) => ({
      message: m.message_text,
      hitCount: m.usage_count,
    })) || [],
  }
}

/**
 * Get merchant recognition statistics
 */
export async function getMerchantRecognitionStats() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: topMerchants } = await supabase
    .from("merchant_category_mapping")
    .select(`
      merchant_name,
      usage_count,
      category_id,
      categories!inner(name)
    `)
    .order("usage_count", { ascending: false })
    .limit(20)

  const { count: totalMerchants } = await supabase
    .from("merchant_category_mapping")
    .select("*", { count: "exact", head: true })

  const totalUsage = topMerchants?.reduce(
    (sum, m: any) => sum + Number(m.usage_count || 0),
    0
  ) || 0

  return {
    totalMerchants: totalMerchants || 0,
    totalMerchantMatches: totalUsage,
    topMerchants: topMerchants?.map((m: any) => ({
      merchantName: m.merchant_name,
      usageCount: m.usage_count,
      categoryName: m.categories?.name || "Unknown",
    })) || [],
  }
}

/**
 * Get pattern learning quality statistics
 */
export async function getPatternLearningQuality() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: patterns } = await supabase
    .from("learned_patterns")
    .select("pattern_type, confidence_score, usage_count, success_count, failure_count, last_used_at")
    .order("usage_count", { ascending: false })

  const patternsWithAccuracy = patterns?.map((p: any) => ({
    patternType: p.pattern_type,
    usageCount: p.usage_count,
    successCount: p.success_count,
    failureCount: p.failure_count,
    accuracy: p.usage_count > 0
      ? Number(((p.success_count / p.usage_count) * 100).toFixed(2))
      : 0,
    confidence: Number((p.confidence_score * 100).toFixed(2)),
    lastUsed: p.last_used_at,
  })) || []

  const typeStats = new Map<string, {
    count: number
    totalUsage: number
    totalSuccess: number
    avgConfidence: number
  }>()

  patterns?.forEach((p: any) => {
    const type = p.pattern_type
    const stats = typeStats.get(type) || {
      count: 0,
      totalUsage: 0,
      totalSuccess: 0,
      avgConfidence: 0,
    }

    stats.count++
    stats.totalUsage += p.usage_count
    stats.totalSuccess += p.success_count
    stats.avgConfidence += p.confidence_score

    typeStats.set(type, stats)
  })

  const typeBreakdown = Array.from(typeStats.entries()).map(([type, stats]) => ({
    patternType: type,
    patternCount: stats.count,
    totalUsage: stats.totalUsage,
    accuracy: stats.totalUsage > 0
      ? Number(((stats.totalSuccess / stats.totalUsage) * 100).toFixed(2))
      : 0,
    avgConfidence: Number(((stats.avgConfidence / stats.count) * 100).toFixed(2)),
  }))

  return {
    patterns: patternsWithAccuracy.slice(0, 20),
    typeBreakdown,
    totalPatterns: patterns?.length || 0,
  }
}

/**
 * Get OCR processing trend over last 30 days
 */
export async function getOCRProcessingTrend() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: ocrMetrics } = await supabase
    .from("parsing_metrics")
    .select("created_at, success, confidence")
    .eq("message_type", "image")
    .gte("created_at", thirtyDaysAgo.toISOString())

  const dateMap = new Map<string, {
    total: number
    successful: number
    totalConfidence: number
  }>()

  for (let i = 0; i < 30; i++) {
    const date = new Date()
    date.setDate(date.getDate() - (29 - i))
    const dateStr = date.toISOString().split("T")[0]
    dateMap.set(dateStr, { total: 0, successful: 0, totalConfidence: 0 })
  }

  ocrMetrics?.forEach((m: any) => {
    const dateStr = m.created_at.split("T")[0]
    const entry = dateMap.get(dateStr)
    if (entry) {
      entry.total++
      if (m.success) entry.successful++
      entry.totalConfidence += Number(m.confidence || 0)
    }
  })

  return Array.from(dateMap.entries()).map(([date, counts]) => ({
    date,
    total: counts.total,
    successful: counts.successful,
    successRate: counts.total > 0
      ? Number(((counts.successful / counts.total) * 100).toFixed(2))
      : 0,
    avgConfidence: counts.total > 0
      ? Number(((counts.totalConfidence / counts.total) * 100).toFixed(2))
      : 0,
  }))
}

/**
 * Get strategy distribution for pie chart
 */
export async function getStrategyDistribution() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: metrics } = await supabase
    .from("parsing_metrics")
    .select("strategy_used")
    .not("strategy_used", "is", null)

  const strategyCounts = new Map<string, number>()
  metrics?.forEach((m: any) => {
    const strategy = m.strategy_used || "unknown"
    strategyCounts.set(strategy, (strategyCounts.get(strategy) || 0) + 1)
  })

  const total = metrics?.length || 0
  return Array.from(strategyCounts.entries()).map(([strategy, count]) => ({
    strategy,
    count,
    percentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
  }))
}

/**
 * Get recent OCR errors for debugging
 */
export async function getRecentOCRErrors(limit: number = 20) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: errors } = await supabase
    .from("parsing_metrics")
    .select("created_at, error_message, parse_duration_ms, user_id")
    .eq("message_type", "image")
    .eq("success", false)
    .not("error_message", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit)

  return errors?.map((e: any) => ({
    createdAt: e.created_at,
    errorMessage: e.error_message,
    processingTime: e.parse_duration_ms,
    userId: e.user_id,
  })) || []
}
