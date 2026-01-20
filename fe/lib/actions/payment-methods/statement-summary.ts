"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent, AnalyticsProperty } from "@/lib/analytics/events"
import type { CalculateStatementPeriodParams } from "@/lib/supabase/rpc-types"
import type { StatementSummary, CategoryBreakdown, InstallmentDetail } from "@/lib/types"

/**
 * Get statement summary for a payment method
 *
 * Story: 3.5 - Pre-Statement Summary with Category Breakdown
 * Acceptance Criteria: AC5.3, AC5.4, AC5.5
 *
 * Performance Target: < 500ms (Epic3-P2)
 */
export async function getStatementSummary(
  paymentMethodId: string
): Promise<StatementSummary | null> {
  const queryStartTime = performance.now()
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    console.error('[getStatementSummary] User not authenticated')
    return null
  }

  try {
    const { data: paymentMethod, error: pmError } = await supabase
      .from('payment_methods')
      .select('name, statement_closing_day, monthly_budget, credit_mode')
      .eq('id', paymentMethodId)
      .eq('user_id', user.id)
      .single()

    if (pmError || !paymentMethod) {
      console.error('[getStatementSummary] Payment method not found:', pmError)
      return null
    }

    if (!paymentMethod.credit_mode) {
      console.error('[getStatementSummary] Payment method is not in Credit Mode')
      return null
    }

    if (!paymentMethod.statement_closing_day) {
      console.error('[getStatementSummary] Statement closing date not set')
      return null
    }

    const { data: periodData, error: periodError } = await supabase.rpc(
      'calculate_statement_period',
      {
        p_closing_day: paymentMethod.statement_closing_day,
        p_reference_date: new Date().toISOString().split('T')[0]
      } as CalculateStatementPeriodParams
    )

    if (periodError || !periodData) {
      console.error('[getStatementSummary] Failed to calculate statement period:', periodError)
      return null
    }

    const result = Array.isArray(periodData) ? periodData[0] : periodData
    const periodStart = new Date(result.period_start + 'T12:00:00')
    const periodEnd = new Date(result.period_end + 'T12:00:00')
    const startDateStr = periodStart.toISOString().split('T')[0]
    const endDateStr = periodEnd.toISOString().split('T')[0]

    const categoryBreakdown = await getCategoryBreakdownForSummary(
      supabase,
      user.id,
      paymentMethodId,
      startDateStr,
      endDateStr
    )

    const totalSpent = categoryBreakdown.reduce((sum, cat) => sum + cat.amount, 0)

    let budgetPercentage: number | null = null
    if (paymentMethod.monthly_budget && paymentMethod.monthly_budget > 0) {
      budgetPercentage = Math.round((totalSpent / paymentMethod.monthly_budget) * 100)
    }

    const executionTime = performance.now() - queryStartTime

    console.log(`[getStatementSummary] Query completed in ${executionTime.toFixed(2)}ms for user ${user.id}`)

    if (executionTime > 500) {
      console.warn(`[getStatementSummary] Query exceeded 500ms target: ${executionTime.toFixed(2)}ms`)
    }

    await trackServerEvent(
      user.id,
      AnalyticsEvent.STATEMENT_SUMMARY_VIEWED,
      {
        [AnalyticsProperty.PAYMENT_METHOD_ID]: paymentMethodId,
        paymentMethodName: paymentMethod.name,
        source: 'web',
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        totalSpent,
        budgetAmount: paymentMethod.monthly_budget,
        budgetPercentage,
        categoryCount: categoryBreakdown.length,
        hasInstallments: categoryBreakdown.some(cat => cat.includesInstallments),
      }
    )

    return {
      paymentMethodName: paymentMethod.name,
      periodStart,
      periodEnd,
      totalSpent,
      monthlyBudget: paymentMethod.monthly_budget,
      budgetPercentage,
      categoryBreakdown
    }
  } catch (error) {
    console.error('[getStatementSummary] Unexpected error:', error)
    return null
  }
}

/**
 * Get category breakdown with transactions and installments
 * Helper function for getStatementSummary
 */
async function getCategoryBreakdownForSummary(
  supabase: any,
  userId: string,
  paymentMethodId: string,
  startDate: string,
  endDate: string
): Promise<CategoryBreakdown[]> {
  const { data: transactionData, error: txError } = await supabase
    .from('transactions')
    .select(`
      amount,
      category_id,
      categories (
        id,
        name,
        icon
      )
    `)
    .eq('user_id', userId)
    .eq('payment_method_id', paymentMethodId)
    .eq('type', 'expense')
    .gte('date', startDate)
    .lte('date', endDate)

  if (txError) {
    console.error('[getCategoryBreakdownForSummary] Error querying transactions:', txError)
    throw new Error('Failed to query transactions')
  }

  const { data: installmentData, error: instError } = await supabase
    .from('installment_payments')
    .select(`
      amount,
      installment_number,
      installment_plans!inner (
        id,
        description,
        total_installments,
        category_id,
        categories (
          id,
          name,
          icon
        )
      )
    `)
    .eq('installment_plans.user_id', userId)
    .eq('installment_plans.payment_method_id', paymentMethodId)
    .eq('status', 'pending')
    .gte('due_date', startDate)
    .lte('due_date', endDate)

  if (instError) {
    console.error('[getCategoryBreakdownForSummary] Error querying installments:', instError)
    throw new Error('Failed to query installments')
  }

  const categoryMap = new Map<string | null, {
    categoryId: string | null
    categoryName: string
    categoryIcon: string | null
    transactionAmount: number
    transactionCount: number
    installmentAmount: number
    installments: InstallmentDetail[]
  }>()

  if (transactionData) {
    for (const tx of transactionData) {
      const categoryId = tx.category_id
      const category = tx.categories as any

      if (!categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, {
          categoryId,
          categoryName: category?.name || 'Outros',
          categoryIcon: category?.icon || null,
          transactionAmount: 0,
          transactionCount: 0,
          installmentAmount: 0,
          installments: []
        })
      }

      const catData = categoryMap.get(categoryId)!
      catData.transactionAmount += tx.amount
      catData.transactionCount += 1
    }
  }

  if (installmentData) {
    for (const payment of installmentData) {
      const installment = payment.installment_plans as any
      const categoryId = installment.category_id
      const category = installment.categories as any

      if (!categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, {
          categoryId,
          categoryName: category?.name || 'Outros',
          categoryIcon: category?.icon || null,
          transactionAmount: 0,
          transactionCount: 0,
          installmentAmount: 0,
          installments: []
        })
      }

      const catData = categoryMap.get(categoryId)!
      catData.installmentAmount += payment.amount
      catData.installments.push({
        description: installment.description,
        currentInstallment: payment.installment_number,
        totalInstallments: installment.total_installments,
        amount: payment.amount
      })
    }
  }

  const categories: CategoryBreakdown[] = []
  let grandTotal = 0

  for (const catData of categoryMap.values()) {
    const amount = catData.transactionAmount + catData.installmentAmount
    grandTotal += amount
  }

  for (const catData of categoryMap.values()) {
    const amount = catData.transactionAmount + catData.installmentAmount
    const percentage = grandTotal > 0 ? Math.round((amount / grandTotal) * 100) : 0

    categories.push({
      categoryId: catData.categoryId,
      categoryName: catData.categoryName,
      categoryIcon: catData.categoryIcon,
      amount,
      percentage,
      transactionCount: catData.transactionCount,
      includesInstallments: catData.installments.length > 0,
      installmentDetails: catData.installments.length > 0 ? catData.installments : undefined
    })
  }

  categories.sort((a, b) => b.amount - a.amount)

  if (categories.length <= 5) {
    return categories
  }

  const top5 = categories.slice(0, 5)
  const remaining = categories.slice(5)

  const othersAmount = remaining.reduce((sum, cat) => sum + cat.amount, 0)
  const othersTransactionCount = remaining.reduce((sum, cat) => sum + cat.transactionCount, 0)
  const othersPercentage = grandTotal > 0 ? Math.round((othersAmount / grandTotal) * 100) : 0

  const othersInstallments: InstallmentDetail[] = []
  for (const cat of remaining) {
    if (cat.installmentDetails) {
      othersInstallments.push(...cat.installmentDetails)
    }
  }

  top5.push({
    categoryId: null,
    categoryName: 'Outros',
    categoryIcon: null,
    amount: othersAmount,
    percentage: othersPercentage,
    transactionCount: othersTransactionCount,
    includesInstallments: othersInstallments.length > 0,
    installmentDetails: othersInstallments.length > 0 ? othersInstallments : undefined
  })

  return top5
}
