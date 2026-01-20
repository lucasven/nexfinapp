"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { verifyAdmin } from "./auth"

/**
 * Get category matching statistics overview
 */
export async function getCategoryMatchingStats() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  // Total corrections count
  const { count: totalCorrections } = await supabase
    .from("category_corrections")
    .select("*", { count: "exact", head: true })

  // Total transactions with categories
  const { count: totalTransactions } = await supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .not("category_id", "is", null)

  // Calculate correction rate
  const correctionRate = totalTransactions && totalTransactions > 0
    ? ((totalCorrections || 0) / totalTransactions) * 100
    : 0

  // Get merchant coverage
  const { data: merchantMappings } = await supabase
    .from("merchant_category_mapping")
    .select("merchant_name")

  const merchantNames = new Set(merchantMappings?.map(m => m.merchant_name.toLowerCase()) || [])

  const { data: transactions } = await supabase
    .from("transactions")
    .select("description")

  let merchantCoverageCount = 0
  transactions?.forEach((t: any) => {
    const desc = t.description?.toLowerCase() || ""
    for (const merchant of merchantNames) {
      if (desc.includes(merchant)) {
        merchantCoverageCount++
        break
      }
    }
  })

  const merchantCoverage = transactions && transactions.length > 0
    ? (merchantCoverageCount / transactions.length) * 100
    : 0

  // Get total synonyms
  const { count: totalSynonyms } = await supabase
    .from("category_synonyms")
    .select("*", { count: "exact", head: true })

  return {
    totalCorrections: totalCorrections || 0,
    totalTransactions: totalTransactions || 0,
    correctionRate: Number(correctionRate.toFixed(2)),
    merchantCoverage: Number(merchantCoverage.toFixed(2)),
    totalSynonyms: totalSynonyms || 0,
    totalMerchantMappings: merchantMappings?.length || 0,
  }
}

/**
 * Get corrections by category for analysis
 */
export async function getCorrectionsByCategory() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: corrections, error } = await supabase
    .from("category_corrections")
    .select(`
      id,
      original_category_id,
      corrected_category_id,
      created_at
    `)
    .order("created_at", { ascending: false })

  if (error) throw error

  // Get all unique category IDs
  const categoryIds = new Set<string>()
  corrections?.forEach((c: any) => {
    if (c.original_category_id) categoryIds.add(c.original_category_id)
    if (c.corrected_category_id) categoryIds.add(c.corrected_category_id)
  })

  // Fetch category names
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .in("id", Array.from(categoryIds))

  const categoryMap = new Map(categories?.map(c => [c.id, c.name]) || [])

  // Count corrections per original category
  const correctionCounts = new Map<string, number>()
  corrections?.forEach((c: any) => {
    const categoryName = categoryMap.get(c.original_category_id) || "Unknown"
    correctionCounts.set(categoryName, (correctionCounts.get(categoryName) || 0) + 1)
  })

  // Convert to array and sort by count
  const result = Array.from(correctionCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  return result
}

/**
 * Get correction flows (FROM category -> TO category patterns)
 */
export async function getCorrectionFlows() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: corrections, error } = await supabase
    .from("category_corrections")
    .select(`
      id,
      original_category_id,
      corrected_category_id
    `)
    .not("original_category_id", "is", null)

  if (error) throw error

  // Get all unique category IDs
  const categoryIds = new Set<string>()
  corrections?.forEach((c: any) => {
    if (c.original_category_id) categoryIds.add(c.original_category_id)
    if (c.corrected_category_id) categoryIds.add(c.corrected_category_id)
  })

  // Fetch category names
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .in("id", Array.from(categoryIds))

  const categoryMap = new Map(categories?.map(c => [c.id, c.name]) || [])

  // Count flows
  const flowCounts = new Map<string, number>()
  corrections?.forEach((c: any) => {
    const from = categoryMap.get(c.original_category_id) || "Unknown"
    const to = categoryMap.get(c.corrected_category_id) || "Unknown"
    const flowKey = `${from}→${to}`
    flowCounts.set(flowKey, (flowCounts.get(flowKey) || 0) + 1)
  })

  // Convert to array and sort by count
  const result = Array.from(flowCounts.entries())
    .map(([flow, count]) => {
      const [from, to] = flow.split("→")
      return { from, to, count }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)

  return result
}

/**
 * Get low-confidence category matches that need review
 */
export async function getLowConfidenceMatches(
  limit: number = 50,
  offset: number = 0
) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: corrections } = await supabase
    .from("category_corrections")
    .select("description, original_category_id, corrected_category_id")
    .not("original_category_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(100)

  const problematicDescriptions = new Set(
    corrections?.map(c => c.description?.toLowerCase().trim()).filter(Boolean) || []
  )

  const { data: transactions, error } = await supabase
    .from("transactions")
    .select(`
      id,
      description,
      amount,
      category_id,
      categories!inner(id, name),
      created_at,
      user_id
    `)
    .order("created_at", { ascending: false })
    .limit(limit)
    .range(offset, offset + limit - 1)

  if (error) throw error

  const result = transactions?.map((t: any) => ({
    id: t.id,
    description: t.description,
    amount: Number(t.amount),
    category: t.categories?.name || "Unknown",
    categoryId: t.category_id,
    userId: t.user_id,
    createdAt: t.created_at,
    needsReview: problematicDescriptions.has(t.description?.toLowerCase().trim()),
    confidence: 0.75,
  })) || []

  return result
}

/**
 * Approve a category match (updates user preferences)
 */
export async function approveCategoryMatch(
  transactionId: string,
  categoryId: string,
  description: string,
  userId: string
) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { error } = await supabase
    .from("user_category_preferences")
    .upsert({
      user_id: userId,
      description_pattern: description.toLowerCase().trim(),
      category_id: categoryId,
      frequency: 1,
      last_used_at: new Date().toISOString(),
    }, {
      onConflict: "user_id,description_pattern",
    })

  if (error) throw error

  await supabase
    .from("admin_actions")
    .insert({
      admin_user_id: (await supabase.auth.getUser()).data.user?.id,
      action_type: "approve_match",
      target_table: "transactions",
      target_id: transactionId,
      details: {
        categoryId,
        description,
        userId,
      },
    })

  revalidatePath("/admin/category-analytics")
}

/**
 * Reject a category match and create a correction
 */
export async function rejectCategoryMatch(
  transactionId: string,
  newCategoryId: string,
  userId: string
) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: transaction } = await supabase
    .from("transactions")
    .select("category_id, description, amount")
    .eq("id", transactionId)
    .single()

  if (!transaction) throw new Error("Transaction not found")

  const { error: updateError } = await supabase
    .from("transactions")
    .update({ category_id: newCategoryId })
    .eq("id", transactionId)

  if (updateError) throw updateError

  await supabase
    .from("category_corrections")
    .insert({
      user_id: userId,
      transaction_id: transactionId,
      original_category_id: transaction.category_id,
      corrected_category_id: newCategoryId,
      description: transaction.description,
      amount: transaction.amount,
      correction_source: "admin_review",
    })

  await supabase
    .from("admin_actions")
    .insert({
      admin_user_id: (await supabase.auth.getUser()).data.user?.id,
      action_type: "reject_match",
      target_table: "transactions",
      target_id: transactionId,
      details: {
        oldCategoryId: transaction.category_id,
        newCategoryId,
        userId,
      },
    })

  revalidatePath("/admin/category-analytics")
}

/**
 * Get all merchant category mappings
 */
export async function getMerchantMappings() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: mappings, error } = await supabase
    .from("merchant_category_mapping")
    .select(`
      id,
      merchant_name,
      category_id,
      categories!inner(id, name),
      confidence,
      usage_count,
      is_global,
      user_id,
      created_at
    `)
    .order("usage_count", { ascending: false })

  if (error) throw error

  return mappings?.map((m: any) => ({
    id: m.id,
    merchantName: m.merchant_name,
    categoryId: m.category_id,
    categoryName: m.categories?.name || "Unknown",
    confidence: Number(m.confidence),
    usageCount: m.usage_count,
    isGlobal: m.is_global,
    userId: m.user_id,
    createdAt: m.created_at,
  })) || []
}

/**
 * Create a new merchant category mapping
 */
export async function createMerchantMapping(
  merchantName: string,
  categoryId: string,
  isGlobal: boolean = false,
  confidence: number = 0.90
) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { error } = await supabase
    .from("merchant_category_mapping")
    .insert({
      merchant_name: merchantName.toUpperCase(),
      category_id: categoryId,
      is_global: isGlobal,
      confidence,
      usage_count: 0,
    })

  if (error) throw error

  await supabase
    .from("admin_actions")
    .insert({
      admin_user_id: (await supabase.auth.getUser()).data.user?.id,
      action_type: "add_merchant",
      target_table: "merchant_category_mapping",
      details: {
        merchantName,
        categoryId,
        isGlobal,
      },
    })

  revalidatePath("/admin/category-analytics")
}

/**
 * Update an existing merchant category mapping
 */
export async function updateMerchantMapping(
  id: string,
  updates: {
    categoryId?: string
    confidence?: number
    isGlobal?: boolean
  }
) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const updateData: any = {}
  if (updates.categoryId) updateData.category_id = updates.categoryId
  if (updates.confidence !== undefined) updateData.confidence = updates.confidence
  if (updates.isGlobal !== undefined) updateData.is_global = updates.isGlobal

  const { error } = await supabase
    .from("merchant_category_mapping")
    .update(updateData)
    .eq("id", id)

  if (error) throw error

  await supabase
    .from("admin_actions")
    .insert({
      admin_user_id: (await supabase.auth.getUser()).data.user?.id,
      action_type: "update_merchant",
      target_table: "merchant_category_mapping",
      target_id: id,
      details: updates,
    })

  revalidatePath("/admin/category-analytics")
}

/**
 * Delete a merchant category mapping
 */
export async function deleteMerchantMapping(id: string) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { error } = await supabase
    .from("merchant_category_mapping")
    .delete()
    .eq("id", id)

  if (error) throw error

  await supabase
    .from("admin_actions")
    .insert({
      admin_user_id: (await supabase.auth.getUser()).data.user?.id,
      action_type: "delete_merchant",
      target_table: "merchant_category_mapping",
      target_id: id,
    })

  revalidatePath("/admin/category-analytics")
}

/**
 * Get all category synonyms
 */
export async function getCategorySynonyms(categoryId?: string) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  let query = supabase
    .from("category_synonyms")
    .select(`
      id,
      category_id,
      categories!inner(id, name),
      synonym,
      language,
      is_merchant,
      confidence,
      created_at
    `)
    .order("category_id")
    .order("synonym")

  if (categoryId) {
    query = query.eq("category_id", categoryId)
  }

  const { data: synonyms, error } = await query

  if (error) throw error

  return synonyms?.map((s: any) => ({
    id: s.id,
    categoryId: s.category_id,
    categoryName: s.categories?.name || "Unknown",
    synonym: s.synonym,
    language: s.language,
    isMerchant: s.is_merchant,
    confidence: Number(s.confidence),
    createdAt: s.created_at,
  })) || []
}

/**
 * Create a new category synonym
 */
export async function createCategorySynonym(
  categoryId: string,
  synonym: string,
  language: string = "pt-BR",
  isMerchant: boolean = false,
  confidence: number = 0.80
) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { error } = await supabase
    .from("category_synonyms")
    .insert({
      category_id: categoryId,
      synonym: synonym.toLowerCase(),
      language,
      is_merchant: isMerchant,
      confidence,
    })

  if (error) throw error

  await supabase
    .from("admin_actions")
    .insert({
      admin_user_id: (await supabase.auth.getUser()).data.user?.id,
      action_type: "add_synonym",
      target_table: "category_synonyms",
      details: {
        categoryId,
        synonym,
        language,
      },
    })

  revalidatePath("/admin/category-analytics")
}

/**
 * Delete a category synonym
 */
export async function deleteCategorySynonym(id: string) {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { error } = await supabase
    .from("category_synonyms")
    .delete()
    .eq("id", id)

  if (error) throw error

  await supabase
    .from("admin_actions")
    .insert({
      admin_user_id: (await supabase.auth.getUser()).data.user?.id,
      action_type: "delete_synonym",
      target_table: "category_synonyms",
      target_id: id,
    })

  revalidatePath("/admin/category-analytics")
}

/**
 * Get correction rate trend over time (last 30 days)
 */
export async function getCorrectionRateTrend() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: corrections } = await supabase
    .from("category_corrections")
    .select("created_at")
    .gte("created_at", thirtyDaysAgo.toISOString())

  const { data: transactions } = await supabase
    .from("transactions")
    .select("created_at")
    .gte("created_at", thirtyDaysAgo.toISOString())
    .not("category_id", "is", null)

  // Group by date
  const dateMap = new Map<string, { corrections: number; transactions: number }>()

  // Initialize all dates in range
  for (let i = 0; i < 30; i++) {
    const date = new Date()
    date.setDate(date.getDate() - (29 - i))
    const dateStr = date.toISOString().split("T")[0]
    dateMap.set(dateStr, { corrections: 0, transactions: 0 })
  }

  corrections?.forEach((c: any) => {
    const dateStr = c.created_at.split("T")[0]
    const entry = dateMap.get(dateStr)
    if (entry) entry.corrections++
  })

  transactions?.forEach((t: any) => {
    const dateStr = t.created_at.split("T")[0]
    const entry = dateMap.get(dateStr)
    if (entry) entry.transactions++
  })

  return Array.from(dateMap.entries()).map(([date, counts]) => ({
    date,
    corrections: counts.corrections,
    transactions: counts.transactions,
    correctionRate: counts.transactions > 0
      ? Number(((counts.corrections / counts.transactions) * 100).toFixed(2))
      : 0,
  }))
}

/**
 * Get match type distribution (for pie chart)
 */
export async function getMatchTypeDistribution() {
  await verifyAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: transactions } = await supabase
    .from("transactions")
    .select("match_type")
    .not("match_type", "is", null)

  const typeCounts = new Map<string, number>()
  transactions?.forEach((t: any) => {
    const type = t.match_type || "unknown"
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1)
  })

  const total = transactions?.length || 0
  return Array.from(typeCounts.entries()).map(([type, count]) => ({
    type,
    count,
    percentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
  }))
}
