"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent, AnalyticsProperty } from "@/lib/analytics/events"
import type {
  SwitchCreditModeParams,
  SwitchCreditModeResult,
  CalculateStatementPeriodParams,
  StatementPeriod
} from "@/lib/supabase/rpc-types"
import type { StatementSummary, CategoryBreakdown, InstallmentDetail } from "@/lib/types"

/**
 * Set credit mode for a payment method (first-time selection)
 *
 * Story: 1-4-credit-mode-selection-web-frontend
 * Acceptance Criteria: AC4.6, AC4.7
 *
 * This server action updates payment_methods.credit_mode column for a credit card
 * when the user makes their first transaction. It only updates if credit_mode is NULL
 * to prevent accidental overwrites.
 *
 * @param paymentMethodId - UUID of the payment method to update
 * @param creditMode - true = Credit Mode (full features), false = Simple Mode (basic tracking)
 * @returns Promise with success status and optional error message
 */
export async function setCreditMode(
  paymentMethodId: string,
  creditMode: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  try {
    // Update payment_methods table, only if credit_mode is currently NULL
    // This prevents accidental overwrites if mode was already set
    const { error: updateError } = await supabase
      .from('payment_methods')
      .update({ credit_mode: creditMode })
      .eq('id', paymentMethodId)
      .eq('user_id', user.id)
      .is('credit_mode', null)

    if (updateError) {
      console.error('[setCreditMode] Database error:', updateError)
      return { success: false, error: updateError.message }
    }

    // Track analytics event (AC4.6, AC4.7)
    // Event: credit_mode_selected
    // Properties: userId, paymentMethodId, mode, channel
    await trackServerEvent(
      user.id,
      AnalyticsEvent.CREDIT_MODE_SELECTED,
      {
        [AnalyticsProperty.PAYMENT_METHOD_ID]: paymentMethodId,
        [AnalyticsProperty.MODE]: creditMode ? 'credit' : 'simple',
        [AnalyticsProperty.CHANNEL]: 'web',
      }
    )

    // Revalidate paths that display payment method data
    revalidatePath('/transactions')
    revalidatePath('/[locale]/transactions')

    return { success: true }
  } catch (error) {
    console.error('[setCreditMode] Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Switch credit mode with data implications warning
 *
 * Story: 1-5-mode-switching-with-data-implications-warning
 * Acceptance Criteria: AC5.13, AC5.15
 *
 * This server action allows users to switch between Credit Mode and Simple Mode
 * with awareness of data implications (active installments). Uses database
 * transactions for atomic updates.
 *
 * @param paymentMethodId - UUID of the payment method to update
 * @param newMode - true = Credit Mode, false = Simple Mode
 * @param options - Optional cleanup configuration
 * @returns Promise with success status, confirmation requirements, or errors
 */
export async function switchCreditMode(
  paymentMethodId: string,
  newMode: boolean,
  options?: { cleanupInstallments?: boolean }
): Promise<SwitchResult> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  try {
    // Get current payment method to track previous mode for analytics
    const { data: paymentMethod, error: fetchError } = await supabase
      .from('payment_methods')
      .select('credit_mode, type')
      .eq('id', paymentMethodId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !paymentMethod) {
      return { success: false, error: "Payment method not found" }
    }

    const previousMode = paymentMethod.credit_mode

    // Story 2.0 Part 3: Check for active installments BEFORE calling RPC (AC3.4)
    // This first phase shows confirmation dialog if needed
    let activeInstallmentsCount = 0
    if (newMode === false && previousMode === true) {
      const { data: installments, error: installmentsError } = await supabase
        .from('installment_plans')
        .select('id')
        .eq('payment_method_id', paymentMethodId)
        .eq('user_id', user.id)
        .eq('status', 'active')

      if (installmentsError) {
        console.error('[switchCreditMode] Error checking installments:', installmentsError)
        return { success: false, error: installmentsError.message }
      }

      activeInstallmentsCount = installments?.length || 0

      // If installments exist and no cleanup option provided, require confirmation
      if (activeInstallmentsCount > 0 && options?.cleanupInstallments === undefined) {
        return {
          success: false,
          requiresConfirmation: true,
          activeInstallments: activeInstallmentsCount
        }
      }
    }

    // Story 2.0 Part 3: Call atomic RPC function for mode switch (AC3.4)
    // This ensures installment updates and mode switch happen atomically
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'switch_credit_mode_atomic',
      {
        p_user_id: user.id,
        p_payment_method_id: paymentMethodId,
        p_new_mode: newMode,
        p_cleanup_installments: options?.cleanupInstallments || false
      } as SwitchCreditModeParams
    )

    if (rpcError) {
      console.error('[switchCreditMode] RPC error:', rpcError)
      return { success: false, error: rpcError.message }
    }

    // Check RPC function result (it returns an array with one row)
    const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult
    if (!result || !result.success) {
      return {
        success: false,
        error: result?.error_message || 'Unknown error from database function'
      }
    }

    // Track analytics event
    await trackServerEvent(
      user.id,
      AnalyticsEvent.CREDIT_MODE_SWITCHED,
      {
        [AnalyticsProperty.PAYMENT_METHOD_ID]: paymentMethodId,
        previousMode: previousMode === true ? 'credit' : previousMode === false ? 'simple' : 'unknown',
        newMode: newMode ? 'credit' : 'simple',
        hadActiveInstallments: activeInstallmentsCount > 0,
        installmentsCleanedUp: options?.cleanupInstallments === true,
        [AnalyticsProperty.CHANNEL]: 'web',
      }
    )

    // Revalidate paths that display payment method data
    revalidatePath('/settings')
    revalidatePath('/[locale]/settings')
    revalidatePath('/settings/account')
    revalidatePath('/[locale]/settings/account')
    revalidatePath('/profile')
    revalidatePath('/[locale]/profile')
    revalidatePath('/transactions')
    revalidatePath('/[locale]/transactions')

    return {
      success: true,
      activeInstallments: activeInstallmentsCount > 0 ? activeInstallmentsCount : undefined
    }
  } catch (error) {
    console.error('[switchCreditMode] Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Result type for switchCreditMode operation
 */
export interface SwitchResult {
  success: boolean
  requiresConfirmation?: boolean
  activeInstallments?: number
  error?: string
}

/**
 * Get all payment methods for the authenticated user
 *
 * This function retrieves all payment methods from the payment_methods table
 * for use in forms and dropdowns.
 *
 * @returns Promise with array of payment methods
 */
export async function getPaymentMethods() {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error("Not authenticated")

  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Get statement period preview for a given closing day
 *
 * Story: 3.1 - Set Statement Closing Date
 * Acceptance Criteria: AC1.2
 *
 * This server action calls the calculate_statement_period() RPC function
 * to provide a real-time preview of statement period boundaries based on
 * the selected closing day.
 *
 * @param closingDay - Day of month when statement closes (1-31)
 * @param referenceDate - Optional reference date (defaults to today)
 * @returns Promise with period dates and days until closing, or null on error
 */
export async function getStatementPeriodPreview(
  closingDay: number,
  referenceDate?: Date
): Promise<{
  periodStart: Date
  periodEnd: Date
  nextClosing: Date
  daysUntilClosing: number
} | null> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    console.error('[getStatementPeriodPreview] User not authenticated')
    return null
  }

  try {
    // Validate closing day
    if (closingDay < 1 || closingDay > 31) {
      console.error('[getStatementPeriodPreview] Invalid closing day:', closingDay)
      return null
    }

    // Prepare parameters for RPC call
    const params: CalculateStatementPeriodParams = {
      p_closing_day: closingDay,
      p_reference_date: referenceDate?.toISOString().split('T')[0]
    }

    // Call calculate_statement_period RPC function
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'calculate_statement_period',
      params
    )

    if (rpcError) {
      console.error('[getStatementPeriodPreview] RPC error:', rpcError)
      return null
    }

    // RPC functions return arrays, so get the first result
    const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult

    if (!result) {
      console.error('[getStatementPeriodPreview] No result from RPC')
      return null
    }

    // Calculate days until closing
    const nextClosingDate = new Date(result.next_closing)
    const today = new Date()
    today.setHours(0, 0, 0, 0) // Normalize to start of day
    const daysUntilClosing = Math.ceil(
      (nextClosingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    )

    return {
      periodStart: new Date(result.period_start + 'T12:00:00'),
      periodEnd: new Date(result.period_end + 'T12:00:00'),
      nextClosing: nextClosingDate,
      daysUntilClosing
    }
  } catch (error) {
    console.error('[getStatementPeriodPreview] Unexpected error:', error)
    return null
  }
}

/**
 * Update statement closing day for a payment method
 *
 * Story: 3.1 - Set Statement Closing Date
 * Acceptance Criteria: AC1.3, AC1.4, AC1.5
 *
 * This server action updates the statement_closing_day for a Credit Mode
 * credit card payment method. It validates inputs, enforces security via RLS,
 * and tracks analytics events.
 *
 * @param paymentMethodId - UUID of the payment method to update
 * @param closingDay - Day of month when statement closes (1-31)
 * @returns Promise with success status, next closing date, or error
 */
export async function updateStatementSettings(
  paymentMethodId: string,
  closingDay: number
): Promise<{ success: boolean; nextClosingDate?: string; error?: string }> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  try {
    // Validate inputs (AC1.3)
    if (closingDay < 1 || closingDay > 31) {
      return {
        success: false,
        error: "Closing day must be between 1 and 31"
      }
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(paymentMethodId)) {
      return { success: false, error: "Invalid payment method ID" }
    }

    // Get current payment method to track previous closing day for analytics
    const { data: paymentMethod, error: fetchError } = await supabase
      .from('payment_methods')
      .select('statement_closing_day, credit_mode, type')
      .eq('id', paymentMethodId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !paymentMethod) {
      return { success: false, error: "Payment method not found" }
    }

    // Verify this is a Credit Mode credit card (AC1.1)
    if (paymentMethod.credit_mode !== true || paymentMethod.type !== 'credit') {
      return {
        success: false,
        error: "Statement settings are only available for Credit Mode credit cards"
      }
    }

    const previousClosingDay = paymentMethod.statement_closing_day

    // Update payment_methods table (AC1.4)
    // RLS policy ensures user_id = auth.uid() automatically
    const { error: updateError } = await supabase
      .from('payment_methods')
      .update({ statement_closing_day: closingDay })
      .eq('id', paymentMethodId)
      .eq('user_id', user.id)
      .eq('credit_mode', true) // Extra safety check

    if (updateError) {
      console.error('[updateStatementSettings] Database error:', updateError)
      return { success: false, error: updateError.message }
    }

    // Calculate next closing date using the RPC function
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'calculate_statement_period',
      {
        p_closing_day: closingDay
      } as CalculateStatementPeriodParams
    )

    if (rpcError) {
      console.error('[updateStatementSettings] RPC error:', rpcError)
      // Note: We still return success because the update succeeded
      // The RPC error only affects the next closing date display
    }

    const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult
    const nextClosingDate = result?.next_closing || null

    // Track analytics event (AC1.5)
    await trackServerEvent(
      user.id,
      AnalyticsEvent.STATEMENT_CLOSING_DAY_SET,
      {
        [AnalyticsProperty.PAYMENT_METHOD_ID]: paymentMethodId,
        closingDay,
        previousClosingDay: previousClosingDay ?? null,
      }
    )

    // Revalidate paths that display payment method data
    revalidatePath('/settings')
    revalidatePath('/[locale]/settings')
    revalidatePath('/transactions')
    revalidatePath('/[locale]/transactions')

    return {
      success: true,
      nextClosingDate: nextClosingDate || undefined
    }
  } catch (error) {
    console.error('[updateStatementSettings] Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Set monthly budget for a payment method
 *
 * Story: 3.2 - Set User-Defined Monthly Budget
 * Acceptance Criteria: AC2.2, AC2.3, AC2.4, AC2.5, AC2.6
 *
 * This server action updates the monthly_budget for a Credit Mode credit card
 * payment method. Budget applies to statement periods (not calendar months) and
 * is optional (can be NULL). Validates inputs, enforces security via RLS, and
 * tracks analytics events.
 *
 * @param paymentMethodId - UUID of the payment method to update
 * @param budget - Monthly budget amount (>= 0) or null to remove budget
 * @returns Promise with success status or error
 */
export async function setMonthlyBudget(
  paymentMethodId: string,
  budget: number | null
): Promise<{ success: boolean; error?: string }> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  try {
    // Validate inputs (AC2.2)
    if (budget !== null && budget < 0) {
      return {
        success: false,
        error: "Budget cannot be negative"
      }
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(paymentMethodId)) {
      return { success: false, error: "Invalid payment method ID" }
    }

    // Get current payment method to verify prerequisites and track previous budget
    const { data: paymentMethod, error: fetchError } = await supabase
      .from('payment_methods')
      .select('monthly_budget, credit_mode, type, statement_closing_day')
      .eq('id', paymentMethodId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !paymentMethod) {
      return { success: false, error: "Payment method not found" }
    }

    // Verify this is a Credit Mode credit card (AC2.1)
    if (paymentMethod.credit_mode !== true || paymentMethod.type !== 'credit') {
      return {
        success: false,
        error: "Monthly budget is only available for Credit Mode credit cards"
      }
    }

    // Verify statement closing date is set (AC2.1)
    if (paymentMethod.statement_closing_day === null) {
      return {
        success: false,
        error: "Please set statement closing date first"
      }
    }

    const previousBudget = paymentMethod.monthly_budget

    // Update payment_methods table (AC2.3)
    // RLS policy ensures user_id = auth.uid() automatically
    const { error: updateError } = await supabase
      .from('payment_methods')
      .update({ monthly_budget: budget })
      .eq('id', paymentMethodId)
      .eq('user_id', user.id)
      .eq('credit_mode', true) // Extra safety check

    if (updateError) {
      console.error('[setMonthlyBudget] Database error:', updateError)
      return { success: false, error: updateError.message }
    }

    // Track analytics event (AC2.6)
    if (budget === null) {
      // Budget removed
      await trackServerEvent(
        user.id,
        AnalyticsEvent.MONTHLY_BUDGET_REMOVED,
        {
          [AnalyticsProperty.PAYMENT_METHOD_ID]: paymentMethodId,
          previousBudget: previousBudget ?? null,
        }
      )
    } else {
      // Budget set or updated
      // Note: For MVP, we're not querying current spending for percentageUsed
      // This will be added in Story 3.3 when the budget progress widget is implemented
      await trackServerEvent(
        user.id,
        AnalyticsEvent.MONTHLY_BUDGET_SET,
        {
          [AnalyticsProperty.PAYMENT_METHOD_ID]: paymentMethodId,
          budgetAmount: budget,
          previousBudget: previousBudget ?? null,
        }
      )
    }

    // Revalidate paths that display payment method data (AC2.4)
    revalidatePath('/settings')
    revalidatePath('/[locale]/settings')
    revalidatePath('/transactions')
    revalidatePath('/[locale]/transactions')

    return { success: true }
  } catch (error) {
    console.error('[setMonthlyBudget] Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Get statement summary for a payment method
 *
 * Story: 3.5 - Pre-Statement Summary with Category Breakdown
 * Acceptance Criteria: AC5.3, AC5.4, AC5.5
 *
 * This server action fetches statement summary data including:
 * - Statement period boundaries
 * - Total spent (transactions + installments)
 * - Category breakdown with percentages
 * - Installment details per category
 *
 * Performance Target: < 500ms (Epic3-P2)
 *
 * @param paymentMethodId - UUID of the payment method
 * @returns Statement summary data or null on error
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
    // 1. Get payment method details (closing day, budget, name)
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

    // 2. Calculate statement period using database function
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

    // 3. Query category breakdown (transactions + installments)
    const categoryBreakdown = await getCategoryBreakdownForSummary(
      supabase,
      user.id,
      paymentMethodId,
      startDateStr,
      endDateStr
    )

    // 4. Calculate total spent
    const totalSpent = categoryBreakdown.reduce((sum, cat) => sum + cat.amount, 0)

    // 5. Calculate budget percentage
    let budgetPercentage: number | null = null
    if (paymentMethod.monthly_budget && paymentMethod.monthly_budget > 0) {
      budgetPercentage = Math.round((totalSpent / paymentMethod.monthly_budget) * 100)
    }

    const executionTime = performance.now() - queryStartTime

    // Log performance (AC5.5)
    console.log(`[getStatementSummary] Query completed in ${executionTime.toFixed(2)}ms for user ${user.id}`)

    if (executionTime > 500) {
      console.warn(`[getStatementSummary] ⚠️ Query exceeded 500ms target: ${executionTime.toFixed(2)}ms`)
    }

    // Track analytics event (AC5.8)
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
 *
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param paymentMethodId - Payment method ID
 * @param startDate - Start of statement period (YYYY-MM-DD)
 * @param endDate - End of statement period (YYYY-MM-DD)
 * @returns Category breakdown array sorted by amount DESC
 */
async function getCategoryBreakdownForSummary(
  supabase: any,
  userId: string,
  paymentMethodId: string,
  startDate: string,
  endDate: string
): Promise<CategoryBreakdown[]> {
  // Query transactions grouped by category
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

  // Query installment payments grouped by category
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

  // Group by category
  const categoryMap = new Map<string | null, {
    categoryId: string | null
    categoryName: string
    categoryIcon: string | null
    transactionAmount: number
    transactionCount: number
    installmentAmount: number
    installments: InstallmentDetail[]
  }>()

  // Process transactions
  if (transactionData) {
    for (const tx of transactionData) {
      const categoryId = tx.category_id
      const category = tx.categories as any

      if (!categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, {
          categoryId,
          categoryName: category?.name || 'Outros',
          categoryIcon: category?.icon || '📱',
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

  // Process installment payments
  if (installmentData) {
    for (const payment of installmentData) {
      const installment = payment.installment_plans as any
      const categoryId = installment.category_id
      const category = installment.categories as any

      if (!categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, {
          categoryId,
          categoryName: category?.name || 'Outros',
          categoryIcon: category?.icon || '📱',
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

  // Calculate totals and percentages
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

  // Sort by amount DESC and return top 5 + others
  categories.sort((a, b) => b.amount - a.amount)

  if (categories.length <= 5) {
    return categories
  }

  // Group remaining categories as "Outros"
  const top5 = categories.slice(0, 5)
  const remaining = categories.slice(5)

  const othersAmount = remaining.reduce((sum, cat) => sum + cat.amount, 0)
  const othersTransactionCount = remaining.reduce((sum, cat) => sum + cat.transactionCount, 0)
  const othersPercentage = grandTotal > 0 ? Math.round((othersAmount / grandTotal) * 100) : 0

  // Collect all installments from remaining categories
  const othersInstallments: InstallmentDetail[] = []
  for (const cat of remaining) {
    if (cat.installmentDetails) {
      othersInstallments.push(...cat.installmentDetails)
    }
  }

  top5.push({
    categoryId: null,
    categoryName: 'Outros',
    categoryIcon: '📱',
    amount: othersAmount,
    percentage: othersPercentage,
    transactionCount: othersTransactionCount,
    includesInstallments: othersInstallments.length > 0,
    installmentDetails: othersInstallments.length > 0 ? othersInstallments : undefined
  })

  return top5
}

/**
 * Set payment due date for a Credit Mode credit card
 *
 * Story: 4-1-set-payment-due-date
 * Acceptance Criteria: AC4.1.4, AC4.1.5
 *
 * This server action updates payment_methods.payment_due_day column for a
 * Credit Mode credit card. Payment due day represents the number of days
 * after statement closing when payment is due (1-60 days).
 *
 * Requirements:
 * - Credit Mode must be enabled (credit_mode = true)
 * - Statement closing day must be set (statement_closing_day IS NOT NULL)
 * - Payment due day must be between 1 and 60
 *
 * @param paymentMethodId - UUID of the payment method to update
 * @param paymentDueDay - Days after statement closing when payment is due (1-60)
 * @returns Promise with success status, next due date, or error message
 */
export async function setPaymentDueDate(
  paymentMethodId: string,
  paymentDueDay: number
): Promise<{ success: boolean; nextDueDate?: Date; error?: string }> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  try {
    // Validate payment due day range (AC4.1.3)
    if (paymentDueDay < 1 || paymentDueDay > 60) {
      return {
        success: false,
        error: 'Payment due day must be between 1 and 60 days after closing',
      }
    }

    // Fetch payment method to verify ownership and get closing day
    const { data: paymentMethod, error: fetchError } = await supabase
      .from('payment_methods')
      .select('id, name, type, credit_mode, statement_closing_day')
      .eq('id', paymentMethodId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !paymentMethod) {
      console.error('[setPaymentDueDate] Payment method not found:', fetchError)
      return { success: false, error: 'Payment method not found' }
    }

    // Verify Credit Mode is enabled (AC4.1.8)
    if (!paymentMethod.credit_mode) {
      return {
        success: false,
        error: 'Payment due date only available for Credit Mode cards',
      }
    }

    // Verify statement closing day is set (AC4.1.7)
    if (paymentMethod.statement_closing_day == null) {
      return {
        success: false,
        error: 'Statement closing day must be set before setting payment due date',
      }
    }

    // Update payment_due_day in database
    const { error: updateError } = await supabase
      .from('payment_methods')
      .update({ payment_due_day: paymentDueDay })
      .eq('id', paymentMethodId)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('[setPaymentDueDate] Database error:', updateError)
      return { success: false, error: updateError.message }
    }

    // Calculate next due date for response
    const { calculatePaymentDueDate } = await import('@/lib/utils/payment-due-date')
    const dueInfo = calculatePaymentDueDate(
      paymentMethod.statement_closing_day,
      paymentDueDay
    )

    // Track analytics event (AC4.1.5)
    await trackServerEvent(user.id, AnalyticsEvent.PAYMENT_DUE_DATE_SET, {
      [AnalyticsProperty.PAYMENT_METHOD_ID]: paymentMethodId,
      payment_due_day: paymentDueDay,
      closing_day: paymentMethod.statement_closing_day,
      calculated_due_date: dueInfo.nextDueDate.toISOString(),
    })

    // Revalidate paths that display payment method settings
    revalidatePath('/[locale]/settings')
    revalidatePath('/settings')

    return {
      success: true,
      nextDueDate: dueInfo.nextDueDate,
    }
  } catch (error) {
    console.error('[setPaymentDueDate] Unexpected error:', error)

    // Track error event
    if (user) {
      await trackServerEvent(user.id, AnalyticsEvent.PAYMENT_DUE_DATE_ERROR, {
        [AnalyticsProperty.PAYMENT_METHOD_ID]: paymentMethodId,
        error_type: 'unexpected',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get payment due date preview
 *
 * Story: 4-1-set-payment-due-date
 * Acceptance Criteria: AC4.1.2
 *
 * This server action calculates a preview of the payment due date without
 * saving to the database. Used for real-time preview as user enters payment
 * due day value.
 *
 * @param paymentMethodId - UUID of the payment method
 * @param paymentDueDay - Days after statement closing when payment is due (1-60)
 * @returns Promise with preview data or null on error
 */
export async function getPaymentDueDatePreview(
  paymentMethodId: string,
  paymentDueDay: number
): Promise<{
  nextDueDate: Date
  dueDay: number
  formattedDate: string
} | null> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  try {
    // Validate payment due day range
    if (paymentDueDay < 1 || paymentDueDay > 60) {
      return null
    }

    // Fetch payment method to get closing day
    const { data: paymentMethod, error: fetchError } = await supabase
      .from('payment_methods')
      .select('statement_closing_day')
      .eq('id', paymentMethodId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !paymentMethod || paymentMethod.statement_closing_day == null) {
      return null
    }

    // Calculate preview
    const { calculatePaymentDueDate, formatPaymentDueDate } = await import(
      '@/lib/utils/payment-due-date'
    )
    const dueInfo = calculatePaymentDueDate(
      paymentMethod.statement_closing_day,
      paymentDueDay
    )

    // Format date for display (using default pt-BR locale)
    const formattedDate = formatPaymentDueDate(dueInfo.nextDueDate, 'pt-BR')

    return {
      nextDueDate: dueInfo.nextDueDate,
      dueDay: dueInfo.dueDay,
      formattedDate,
    }
  } catch (error) {
    console.error('[getPaymentDueDatePreview] Error:', error)
    return null
  }
}

import type { PaymentMethodType } from '@/lib/constants/payment-methods'

/**
 * Find or create a payment method by name
 *
 * Mirrors the WhatsApp bot's findOrCreatePaymentMethod function.
 * If a payment method with the given name exists, returns it.
 * Otherwise, creates a new one and returns it.
 *
 * @param name - Name of the payment method
 * @param type - Type of payment method
 * @returns The payment method (existing or newly created)
 */
export async function findOrCreatePaymentMethod(
  name: string,
  type: PaymentMethodType = 'other'
): Promise<{ success: boolean; paymentMethod?: { id: string; name: string }; error?: string }> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  try {
    // First, try to find existing payment method by name
    const { data: existing, error: findError } = await supabase
      .from('payment_methods')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('name', name)
      .maybeSingle()

    if (findError) {
      console.error('[findOrCreatePaymentMethod] Error finding:', findError)
      return { success: false, error: findError.message }
    }

    if (existing) {
      return { success: true, paymentMethod: { id: existing.id, name: existing.name } }
    }

    // Payment method doesn't exist - create it
    const { data: created, error: createError } = await supabase
      .from('payment_methods')
      .insert({
        user_id: user.id,
        name: name,
        type: type,
        credit_mode: type === 'credit' ? null : undefined
      })
      .select('id, name')
      .single()

    if (createError) {
      console.error('[findOrCreatePaymentMethod] Error creating:', createError)
      return { success: false, error: createError.message }
    }

    // Track analytics event
    await trackServerEvent(
      user.id,
      AnalyticsEvent.PAYMENT_METHOD_CREATED,
      {
        paymentMethodName: name,
        paymentMethodType: type,
        source: 'web_transaction_dialog',
      }
    )

    // Revalidate paths that display payment methods
    revalidatePath('/')
    revalidatePath('/[locale]')

    return { success: true, paymentMethod: { id: created.id, name: created.name } }
  } catch (error) {
    console.error('[findOrCreatePaymentMethod] Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Create a new credit card with all settings
 *
 * Creates a credit card payment method with name, mode, and optional
 * statement settings (closing day, payment due day) in a single operation.
 *
 * @param data.name - Name of the credit card
 * @param data.creditMode - true = Credit Mode, false = Simple Mode
 * @param data.statementClosingDay - Day of month statement closes (1-31), only for Credit Mode
 * @param data.paymentDueDay - Days after closing when payment is due (1-60), only for Credit Mode
 * @returns Promise with success status and created card ID
 */
export async function createCreditCard(data: {
  name: string
  creditMode: boolean
  statementClosingDay?: number
  paymentDueDay?: number
}): Promise<{ success: boolean; paymentMethodId?: string; error?: string }> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Validate inputs
  const trimmedName = data.name?.trim()
  if (!trimmedName) {
    return { success: false, error: 'Card name is required' }
  }

  // Validate statement closing day if provided
  if (data.statementClosingDay !== undefined) {
    if (data.statementClosingDay < 1 || data.statementClosingDay > 31) {
      return { success: false, error: 'Statement closing day must be between 1 and 31' }
    }
  }

  // Validate payment due day if provided
  if (data.paymentDueDay !== undefined) {
    if (data.paymentDueDay < 1 || data.paymentDueDay > 60) {
      return { success: false, error: 'Payment due day must be between 1 and 60' }
    }
    // Payment due day requires closing day
    if (!data.statementClosingDay) {
      return { success: false, error: 'Statement closing day is required when setting payment due day' }
    }
  }

  try {
    // Check for duplicate name
    const { data: existing, error: findError } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('user_id', user.id)
      .ilike('name', trimmedName)
      .maybeSingle()

    if (findError) {
      console.error('[createCreditCard] Error checking duplicate:', findError)
      return { success: false, error: findError.message }
    }

    if (existing) {
      return { success: false, error: 'A card with this name already exists' }
    }

    // Build the insert data
    const insertData: Record<string, any> = {
      user_id: user.id,
      name: trimmedName,
      type: 'credit',
      credit_mode: data.creditMode,
    }

    // Only add statement settings if Credit Mode
    if (data.creditMode) {
      if (data.statementClosingDay) {
        insertData.statement_closing_day = data.statementClosingDay
      }
      if (data.paymentDueDay) {
        insertData.payment_due_day = data.paymentDueDay
      }
    }

    // Create the payment method
    const { data: created, error: createError } = await supabase
      .from('payment_methods')
      .insert(insertData)
      .select('id')
      .single()

    if (createError) {
      console.error('[createCreditCard] Error creating:', createError)
      // Check for unique constraint violation
      if (createError.code === '23505') {
        return { success: false, error: 'A card with this name already exists' }
      }
      return { success: false, error: createError.message }
    }

    // Track analytics event
    await trackServerEvent(
      user.id,
      AnalyticsEvent.CREDIT_CARD_CREATED,
      {
        cardName: trimmedName,
        creditMode: data.creditMode,
        hasClosingDay: !!data.statementClosingDay,
        hasDueDay: !!data.paymentDueDay,
        source: 'settings_dialog',
      }
    )

    // Revalidate paths
    revalidatePath('/')
    revalidatePath('/[locale]')
    revalidatePath('/[locale]/profile')

    return { success: true, paymentMethodId: created.id }
  } catch (error) {
    console.error('[createCreditCard] Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Update credit card settings
 *
 * Updates multiple credit card settings in a single operation:
 * - Card name
 * - Statement closing day
 * - Payment due day
 * - Monthly budget
 *
 * Note: Credit mode should be updated separately using switchCreditMode()
 *
 * @param data - Settings to update (only non-undefined fields will be updated)
 * @returns Promise with success status or error
 */
export async function updateCreditCardSettings(data: {
  paymentMethodId: string
  name?: string
  statementClosingDay?: number
  paymentDueDay?: number
  monthlyBudget?: number
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  try {
    // Validate payment method ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(data.paymentMethodId)) {
      return { success: false, error: 'Invalid payment method ID' }
    }

    // Validate inputs
    if (data.name !== undefined) {
      const trimmedName = data.name.trim()
      if (!trimmedName) {
        return { success: false, error: 'Card name cannot be empty' }
      }
    }

    if (data.statementClosingDay !== undefined) {
      if (data.statementClosingDay < 1 || data.statementClosingDay > 31) {
        return { success: false, error: 'Statement closing day must be between 1 and 31' }
      }
    }

    if (data.paymentDueDay !== undefined) {
      if (data.paymentDueDay < 1 || data.paymentDueDay > 60) {
        return { success: false, error: 'Payment due day must be between 1 and 60' }
      }
    }

    if (data.monthlyBudget !== undefined) {
      if (data.monthlyBudget < 0) {
        return { success: false, error: 'Monthly budget cannot be negative' }
      }
    }

    // Get current payment method to verify ownership and prerequisites
    const { data: paymentMethod, error: fetchError } = await supabase
      .from('payment_methods')
      .select('id, name, type, credit_mode, statement_closing_day, payment_due_day, monthly_budget')
      .eq('id', data.paymentMethodId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !paymentMethod) {
      console.error('[updateCreditCardSettings] Payment method not found:', fetchError)
      return { success: false, error: 'Payment method not found' }
    }

    // Build update object with only fields that were provided
    const updateData: Record<string, any> = {}

    if (data.name !== undefined) {
      updateData.name = data.name.trim()
    }

    if (data.statementClosingDay !== undefined) {
      // Verify Credit Mode for statement settings
      if (!paymentMethod.credit_mode) {
        return { success: false, error: 'Statement settings only available for Credit Mode cards' }
      }
      updateData.statement_closing_day = data.statementClosingDay
    }

    if (data.paymentDueDay !== undefined) {
      // Verify Credit Mode and closing day for payment due day
      if (!paymentMethod.credit_mode) {
        return { success: false, error: 'Payment due date only available for Credit Mode cards' }
      }
      if (!paymentMethod.statement_closing_day && !data.statementClosingDay) {
        return { success: false, error: 'Statement closing day must be set before setting payment due day' }
      }
      updateData.payment_due_day = data.paymentDueDay
    }

    if (data.monthlyBudget !== undefined) {
      // Verify Credit Mode for budget
      if (!paymentMethod.credit_mode) {
        return { success: false, error: 'Monthly budget only available for Credit Mode cards' }
      }
      updateData.monthly_budget = data.monthlyBudget
    }

    // If nothing to update, return success
    if (Object.keys(updateData).length === 0) {
      return { success: true }
    }

    // Update payment method
    const { error: updateError } = await supabase
      .from('payment_methods')
      .update(updateData)
      .eq('id', data.paymentMethodId)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('[updateCreditCardSettings] Database error:', updateError)
      return { success: false, error: updateError.message }
    }

    // Track analytics events for each updated field
    if (data.name !== undefined && data.name !== paymentMethod.name) {
      await trackServerEvent(user.id, AnalyticsEvent.CREDIT_CARD_UPDATED, {
        [AnalyticsProperty.PAYMENT_METHOD_ID]: data.paymentMethodId,
        field: 'name',
        previousValue: paymentMethod.name,
        newValue: data.name,
      })
    }

    if (data.statementClosingDay !== undefined && data.statementClosingDay !== paymentMethod.statement_closing_day) {
      await trackServerEvent(user.id, AnalyticsEvent.STATEMENT_CLOSING_DAY_SET, {
        [AnalyticsProperty.PAYMENT_METHOD_ID]: data.paymentMethodId,
        closingDay: data.statementClosingDay,
        previousClosingDay: paymentMethod.statement_closing_day ?? null,
      })
    }

    if (data.paymentDueDay !== undefined && data.paymentDueDay !== paymentMethod.payment_due_day) {
      await trackServerEvent(user.id, AnalyticsEvent.PAYMENT_DUE_DATE_SET, {
        [AnalyticsProperty.PAYMENT_METHOD_ID]: data.paymentMethodId,
        payment_due_day: data.paymentDueDay,
        previous_payment_due_day: paymentMethod.payment_due_day ?? null,
      })
    }

    if (data.monthlyBudget !== undefined && data.monthlyBudget !== paymentMethod.monthly_budget) {
      if (data.monthlyBudget === 0 && paymentMethod.monthly_budget !== null) {
        await trackServerEvent(user.id, AnalyticsEvent.MONTHLY_BUDGET_REMOVED, {
          [AnalyticsProperty.PAYMENT_METHOD_ID]: data.paymentMethodId,
          previousBudget: paymentMethod.monthly_budget,
        })
      } else {
        await trackServerEvent(user.id, AnalyticsEvent.MONTHLY_BUDGET_SET, {
          [AnalyticsProperty.PAYMENT_METHOD_ID]: data.paymentMethodId,
          budgetAmount: data.monthlyBudget,
          previousBudget: paymentMethod.monthly_budget ?? null,
        })
      }
    }

    // Revalidate paths
    revalidatePath('/')
    revalidatePath('/[locale]')
    revalidatePath('/[locale]/credit-cards')
    revalidatePath('/[locale]/settings')
    revalidatePath('/settings')

    return { success: true }
  } catch (error) {
    console.error('[updateCreditCardSettings] Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Delete Payment Method
 *
 * Deletes a payment method (credit card or bank account).
 * Note: Transactions associated with this payment method will remain in the system.
 */
export async function deletePaymentMethod(paymentMethodId: string) {
  try {
    const supabase = await getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    // Delete the payment method
    const { error: deleteError } = await supabase
      .from('payment_methods')
      .delete()
      .eq('id', paymentMethodId)
      .eq('user_id', user.id) // Ensure user owns this payment method

    if (deleteError) {
      console.error('[deletePaymentMethod] Error deleting:', deleteError)
      return { success: false, error: deleteError.message }
    }

    // Revalidate paths
    revalidatePath('/')
    revalidatePath('/[locale]')
    revalidatePath('/[locale]/credit-cards')

    return { success: true }
  } catch (error) {
    console.error('[deletePaymentMethod] Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
