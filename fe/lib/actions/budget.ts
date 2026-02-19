/**
 * Budget Calculation with Installment Integration
 *
 * Story 2.8: Installment Impact on Budget Tracking
 *
 * This module provides budget calculation that includes:
 * - Regular transactions in the statement period
 * - Installment payments due in the statement period (pending only)
 *
 * Key Concepts:
 * - Only monthly payments count, not total installment amount
 * - Uses UNION ALL for efficient query (no duplicate elimination needed)
 * - Statement period calculated based on closing day (placeholder: day 5)
 * - Performance target: < 300ms for 95th percentile
 */

"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent, AnalyticsProperty } from "@/lib/analytics/events"
import { getStatementPeriod } from "@/lib/utils/statement-period"
import { getAuthenticatedUser } from "./shared"

/**
 * Transaction detail in budget breakdown
 */
export interface BudgetTransactionDetail {
  date: string
  description: string
  amount: number
  categoryId: string | null
  categoryName: string | null
  categoryEmoji: string | null
  isInstallment: boolean
  installmentInfo?: {
    paymentNumber: number
    totalInstallments: number
    planDescription: string
  }
}

/**
 * Category breakdown in budget
 */
export interface BudgetCategoryBreakdown {
  categoryId: string | null
  categoryName: string
  categoryEmoji: string | null
  categoryTotal: number
  transactions: BudgetTransactionDetail[]
  regularCount: number
  installmentCount: number
}

/**
 * Budget breakdown structure
 */
export interface BudgetBreakdown {
  totalSpent: number
  regularTransactions: number
  installmentPayments: number
  categories: BudgetCategoryBreakdown[]
  transactionDetails: BudgetTransactionDetail[]
  executionTime: number
}

/**
 * Budget for period response
 */
export interface BudgetForPeriodResponse {
  success: boolean
  data?: BudgetBreakdown
  error?: string
}

/**
 * Get budget for a specific statement period
 *
 * Combines regular transactions and installment payments due in the period.
 * Only pending installment payments are included (paid payments would be
 * double-counted as regular transactions).
 *
 * @param paymentMethodId - Payment method to calculate budget for
 * @param periodStart - Start of statement period (inclusive)
 * @param periodEnd - End of statement period (inclusive)
 * @returns Budget breakdown with totals and category details
 *
 * @example
 * const period = getStatementPeriod(new Date(), 5)
 * const result = await getBudgetForPeriod('pm-id', period.periodStart, period.periodEnd)
 */
export async function getBudgetForPeriod(
  paymentMethodId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<BudgetForPeriodResponse> {
  const queryStartTime = performance.now()

  try {
    const supabase = await getSupabaseServerClient()
    const { user, error: authError } = await getAuthenticatedUser()

    if (!user) {
      return {
        success: false,
        error: authError || "Not authenticated"
      }
    }

    // Verify payment method belongs to user
    const { data: paymentMethod, error: pmError } = await supabase
      .from("payment_methods")
      .select("id")
      .eq("id", paymentMethodId)
      .eq("user_id", user.id)
      .single()

    if (pmError || !paymentMethod) {
      return {
        success: false,
        error: "Payment method not found or unauthorized"
      }
    }

    // Format dates for SQL (YYYY-MM-DD)
    const startDateStr = periodStart.toISOString().split("T")[0]
    const endDateStr = periodEnd.toISOString().split("T")[0]

    // Execute budget query with UNION ALL
    // Part 1: Regular transactions in period
    // Part 2: Installment payments due in period (pending only)
    const { data: budgetData, error: budgetError } = await supabase.rpc(
      "get_budget_for_period",
      {
        p_user_id: user.id,
        p_payment_method_id: paymentMethodId,
        p_period_start: startDateStr,
        p_period_end: endDateStr
      }
    )

    if (budgetError) {
      console.error("Budget query error:", budgetError)
      return {
        success: false,
        error: budgetError.message
      }
    }

    const queryExecutionTime = performance.now() - queryStartTime

    // Log slow queries
    if (queryExecutionTime > 300) {
      console.warn(`Budget query slow: ${queryExecutionTime.toFixed(2)}ms`, {
        userId: user.id,
        paymentMethodId,
        periodStart: startDateStr,
        periodEnd: endDateStr,
        resultCount: budgetData?.length || 0
      })

      // Track slow query in analytics
      await trackServerEvent(user.id, AnalyticsEvent.BUDGET_QUERY_SLOW, {
        [AnalyticsProperty.PAYMENT_METHOD_ID]: paymentMethodId,
        execution_time: queryExecutionTime,
        threshold: 300,
        result_count: budgetData?.length || 0
      })
    }

    // Process and group results by category
    const categoryMap = new Map<string, BudgetCategoryBreakdown>()
    let totalSpent = 0
    let regularCount = 0
    let installmentCount = 0

    for (const row of budgetData || []) {
      const categoryKey = row.category_id || "uncategorized"

      if (!categoryMap.has(categoryKey)) {
        categoryMap.set(categoryKey, {
          categoryId: row.category_id,
          categoryName: row.category_name || "Sem Categoria",
          categoryEmoji: row.category_emoji,
          categoryTotal: 0,
          transactions: [],
          regularCount: 0,
          installmentCount: 0
        })
      }

      const category = categoryMap.get(categoryKey)!

      const transaction: BudgetTransactionDetail = {
        date: row.date,
        description: row.description,
        amount: Number(row.amount),
        categoryId: row.category_id,
        categoryName: row.category_name,
        categoryEmoji: row.category_emoji,
        isInstallment: row.is_installment,
        installmentInfo: row.is_installment
          ? {
              paymentNumber: row.installment_number,
              totalInstallments: row.total_installments,
              planDescription: row.plan_description
            }
          : undefined
      }

      category.transactions.push(transaction)
      category.categoryTotal += transaction.amount
      totalSpent += transaction.amount

      if (row.is_installment) {
        category.installmentCount++
        installmentCount++
      } else {
        category.regularCount++
        regularCount++
      }
    }

    // Convert map to sorted array
    const categories = Array.from(categoryMap.values()).sort(
      (a, b) => b.categoryTotal - a.categoryTotal
    )

    // Flatten all transactions for detail view
    const transactionDetails = categories.flatMap((c) => c.transactions)

    const breakdown: BudgetBreakdown = {
      totalSpent,
      regularTransactions: regularCount,
      installmentPayments: installmentCount,
      categories,
      transactionDetails,
      executionTime: queryExecutionTime
    }

    // Track budget viewed event
    await trackServerEvent(user.id, AnalyticsEvent.BUDGET_VIEWED, {
      [AnalyticsProperty.PAYMENT_METHOD_ID]: paymentMethodId,
      period_start: startDateStr,
      period_end: endDateStr,
      total_spent: totalSpent,
      regular_transactions: regularCount,
      installment_payments: installmentCount,
      category_count: categories.length,
      execution_time: queryExecutionTime
    })

    return {
      success: true,
      data: breakdown
    }
  } catch (error) {
    console.error("Budget calculation error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}

/**
 * Get budget for current statement period
 *
 * Convenience wrapper that calculates the current statement period
 * based on the payment method's closing day (or default day 5).
 *
 * @param paymentMethodId - Payment method to calculate budget for
 * @returns Budget breakdown for current statement period
 */
export async function getCurrentBudget(
  paymentMethodId: string
): Promise<BudgetForPeriodResponse> {
  // TODO Epic 3: Read closing day from payment_methods table
  // For now, use default closing day = 5
  const closingDay = 5
  const period = getStatementPeriod(new Date(), closingDay)

  return getBudgetForPeriod(paymentMethodId, period.periodStart, period.periodEnd)
}

// ============================================================================
// Story 3.3: Budget Progress Dashboard
// ============================================================================

import type { BudgetProgress, BudgetStatus } from "@/lib/supabase/rpc-types"

/**
 * Determine budget status based on percentage used
 *
 * - on-track: 0-79% of budget used (Blue - neutral positive)
 * - near-limit: 80-99% of budget used (Yellow/Amber - caution)
 * - exceeded: 100%+ of budget used (Gray - awareness-first, NOT red)
 */
function determineBudgetStatus(percentageUsed: number): BudgetStatus {
  if (percentageUsed < 80) {
    return 'on-track'
  } else if (percentageUsed < 100) {
    return 'near-limit'
  } else {
    return 'exceeded'
  }
}

/**
 * Calculate days until closing date
 */
function calculateDaysUntilClosing(periodEnd: Date): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const endDate = new Date(periodEnd)
  endDate.setHours(0, 0, 0, 0)

  const diffTime = endDate.getTime() - today.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  return diffDays
}

/**
 * Get budget progress for a specific payment method
 *
 * Story 3.3: Budget Progress Dashboard Statement Period
 *
 * Returns budget progress data including:
 * - Statement period dates
 * - Budget amount and spent amount
 * - Remaining amount and percentage used
 * - Budget status (on-track, near-limit, exceeded)
 * - Days until statement closing
 *
 * @param paymentMethodId - Payment method to get budget progress for
 * @returns BudgetProgress object or null if not applicable
 *
 * @example
 * const progress = await getBudgetProgress('pm-uuid')
 * if (progress) {
 *   console.log(`${progress.percentageUsed}% of budget used`)
 * }
 */
export async function getBudgetProgress(
  paymentMethodId: string
): Promise<BudgetProgress | null> {
  const queryStartTime = performance.now()

  try {
    const supabase = await getSupabaseServerClient()
    const { user } = await getAuthenticatedUser()

    if (!user) {
      console.error("getBudgetProgress: Not authenticated")
      return null
    }

    // Get payment method with budget and closing day
    const { data: paymentMethod, error: pmError } = await supabase
      .from("payment_methods")
      .select("id, name, credit_mode, statement_closing_day, payment_due_day, days_before_closing, monthly_budget")
      .eq("id", paymentMethodId)
      .eq("user_id", user.id)
      .single()

    if (pmError || !paymentMethod) {
      console.error("getBudgetProgress: Payment method not found", pmError)
      return null
    }

    // Only return budget progress for Credit Mode cards
    if (!paymentMethod.credit_mode) {
      return null
    }

    // Require budget to be set
    if (!paymentMethod.monthly_budget) {
      return null
    }

    // Require either new model (payment_due_day + days_before_closing) or old model (statement_closing_day)
    if (!paymentMethod.days_before_closing && !paymentMethod.statement_closing_day) {
      return null
    }

    // Calculate current statement period using new or old model
    let periodData, periodError;
    if (paymentMethod.days_before_closing !== null && paymentMethod.payment_due_day) {
      ({ data: periodData, error: periodError } = await supabase.rpc(
        "calculate_statement_period_v2",
        {
          p_payment_day: paymentMethod.payment_due_day,
          p_days_before: paymentMethod.days_before_closing,
          p_reference_date: new Date().toISOString().split("T")[0]
        }
      ))
    } else {
      ({ data: periodData, error: periodError } = await supabase.rpc(
        "calculate_statement_period",
        {
          p_closing_day: paymentMethod.statement_closing_day!,
          p_reference_date: new Date().toISOString().split("T")[0]
        }
      ))
    }

    if (periodError || !periodData || periodData.length === 0) {
      console.error("getBudgetProgress: Failed to calculate statement period", periodError)
      return null
    }

    const period = periodData[0]
    const periodStart = new Date(period.period_start + 'T12:00:00')
    const periodEnd = new Date(period.period_end + 'T12:00:00')

    // Calculate spent amount using the calculate_statement_budget_spent function
    const { data: spentAmount, error: spentError } = await supabase.rpc(
      "calculate_statement_budget_spent",
      {
        p_payment_method_id: paymentMethodId,
        p_user_id: user.id,
        p_start_date: period.period_start,
        p_end_date: period.period_end
      }
    )

    if (spentError) {
      console.error("getBudgetProgress: Failed to calculate spent amount", spentError)
      return null
    }

    const spent = Number(spentAmount) || 0
    const budget = Number(paymentMethod.monthly_budget)
    const remaining = budget - spent
    const percentageUsed = budget > 0 ? (spent / budget) * 100 : 0
    const status = determineBudgetStatus(percentageUsed)
    const daysUntilClosing = calculateDaysUntilClosing(periodEnd)

    const queryExecutionTime = performance.now() - queryStartTime

    // Log slow queries (critical path - target < 200ms, NFR5)
    if (queryExecutionTime > 200) {
      console.warn(`Budget progress query slow: ${queryExecutionTime.toFixed(2)}ms`, {
        userId: user.id,
        paymentMethodId,
        threshold: 200
      })

      // Track slow query in analytics
      await trackServerEvent(user.id, AnalyticsEvent.BUDGET_QUERY_SLOW, {
        [AnalyticsProperty.PAYMENT_METHOD_ID]: paymentMethodId,
        execution_time: queryExecutionTime,
        threshold: 200,
        operation: 'budget_progress'
      })
    }

    const budgetProgress: BudgetProgress = {
      paymentMethodId: paymentMethod.id,
      paymentMethodName: paymentMethod.name,
      monthlyBudget: budget,
      spentAmount: spent,
      remainingAmount: remaining,
      percentageUsed: Math.round(percentageUsed * 100) / 100, // Round to 2 decimal places
      status,
      periodStart,
      periodEnd,
      daysUntilClosing
    }

    // Track budget progress viewed event
    await trackServerEvent(user.id, AnalyticsEvent.BUDGET_PROGRESS_VIEWED, {
      [AnalyticsProperty.PAYMENT_METHOD_ID]: paymentMethodId,
      percentage_used: budgetProgress.percentageUsed,
      status: status,
      days_until_closing: daysUntilClosing,
      execution_time: queryExecutionTime
    })

    return budgetProgress
  } catch (error) {
    console.error("getBudgetProgress: Unexpected error", error)
    return null
  }
}

/**
 * Get budget progress for all Credit Mode payment methods with budgets set
 *
 * Story 3.3: Budget Progress Dashboard Statement Period
 *
 * Returns array of budget progress data sorted by next closing date (soonest first).
 * Only includes Credit Mode cards with both closing day and monthly budget set.
 *
 * @returns Array of BudgetProgress objects
 *
 * @example
 * const allProgress = await getAllBudgetProgress()
 * allProgress.forEach(progress => {
 *   console.log(`${progress.paymentMethodName}: ${progress.percentageUsed}% used`)
 * })
 */
export async function getAllBudgetProgress(): Promise<BudgetProgress[]> {
  try {
    const supabase = await getSupabaseServerClient()
    const { user } = await getAuthenticatedUser()

    if (!user) {
      console.error("getAllBudgetProgress: Not authenticated")
      return []
    }

    // Get all Credit Mode payment methods with budget and closing day
    const { data: paymentMethods, error: pmError } = await supabase
      .from("payment_methods")
      .select("id")
      .eq("user_id", user.id)
      .eq("credit_mode", true)
      .not("statement_closing_day", "is", null)
      .not("monthly_budget", "is", null)

    if (pmError || !paymentMethods) {
      console.error("getAllBudgetProgress: Failed to fetch payment methods", pmError)
      return []
    }

    // Fetch budget progress for all cards in parallel
    const progressPromises = paymentMethods.map(pm => getBudgetProgress(pm.id))
    const progressResults = await Promise.all(progressPromises)

    // Filter out nulls and sort by days until closing (soonest first)
    const validProgress = progressResults
      .filter((p): p is BudgetProgress => p !== null)
      .sort((a, b) => a.daysUntilClosing - b.daysUntilClosing)

    return validProgress
  } catch (error) {
    console.error("getAllBudgetProgress: Unexpected error", error)
    return []
  }
}
