/**
 * Statement Summary Service
 *
 * Story 3.5: Pre-Statement Summary with Category Breakdown
 *
 * This service fetches statement summary data including:
 * - Statement period boundaries
 * - Total spent (transactions + installments)
 * - Category breakdown with percentages
 * - Installment details per category
 *
 * Performance Target: < 500ms (Epic3-P2)
 */

import { createClient } from '@supabase/supabase-js'
import type { StatementSummary, CategoryBreakdown, InstallmentDetail } from '../../types.js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

/**
 * Get statement summary for a payment method
 *
 * @param userId - User ID
 * @param paymentMethodId - Payment method ID
 * @returns Statement summary with category breakdown
 */
export async function getStatementSummaryData(
  userId: string,
  paymentMethodId: string
): Promise<StatementSummary> {
  const startTime = performance.now()

  // 1. Get payment method details (closing day, budget, name)
  const { data: paymentMethod, error: pmError } = await supabase
    .from('payment_methods')
    .select('name, statement_closing_day, payment_due_day, days_before_closing, monthly_budget, credit_mode')
    .eq('id', paymentMethodId)
    .eq('user_id', userId)
    .single()

  if (pmError || !paymentMethod) {
    throw new Error('Payment method not found')
  }

  if (!paymentMethod.credit_mode) {
    throw new Error('Payment method is not in Credit Mode')
  }

  if (!paymentMethod.statement_closing_day && !paymentMethod.days_before_closing) {
    throw new Error('Statement closing date not set')
  }

  // 2. Calculate statement period using new or old model
  let periodData, periodError;
  if (paymentMethod.days_before_closing !== null && paymentMethod.payment_due_day) {
    ({ data: periodData, error: periodError } = await supabase.rpc(
      'calculate_statement_period_v2',
      {
        p_payment_day: paymentMethod.payment_due_day,
        p_days_before: paymentMethod.days_before_closing,
        p_reference_date: new Date().toISOString().split('T')[0]
      }
    ))
  } else {
    ({ data: periodData, error: periodError } = await supabase.rpc(
      'calculate_statement_period',
      {
        p_closing_day: paymentMethod.statement_closing_day!,
        p_reference_date: new Date().toISOString().split('T')[0]
      }
    ))
  }

  if (periodError || !periodData || periodData.length === 0) {
    console.error('Error calculating statement period:', periodError)
    throw new Error('Failed to calculate statement period')
  }

  // Extract first row from TABLE result
  const period = periodData[0]

  // DEBUG: Log what database returned
  console.log('🔍 DEBUG - Database returned:', {
    period_start: period.period_start,
    period_end: period.period_end,
    period_start_type: typeof period.period_start,
    period_end_type: typeof period.period_end
  })

  // Validate period data
  if (!period.period_start || !period.period_end) {
    console.error('Invalid period data returned:', period)
    throw new Error('Invalid statement period returned from database')
  }

  // Parse dates without timezone conversion (YYYY-MM-DD format)
  // Add 'T12:00:00' to avoid timezone issues
  const periodStart = new Date(period.period_start + 'T12:00:00')
  const periodEnd = new Date(period.period_end + 'T12:00:00')

  // DEBUG: Log created Date objects
  console.log('🔍 DEBUG - Created Date objects:', {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    periodStartLocal: periodStart.toString(),
    periodEndLocal: periodEnd.toString()
  })

  // Validate Date objects
  if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
    console.error('Invalid dates created from period data:', {
      periodStart: period.period_start,
      periodEnd: period.period_end,
      periodStartObj: periodStart,
      periodEndObj: periodEnd
    })
    throw new Error('Invalid dates in statement period')
  }

  // 3. Query category breakdown
  const categoryBreakdown = await getCategoryBreakdown(
    userId,
    paymentMethodId,
    periodStart,
    periodEnd
  )

  // 4. Calculate total spent
  const totalSpent = categoryBreakdown.reduce((sum, cat) => sum + cat.amount, 0)

  // 5. Calculate budget percentage
  let budgetPercentage: number | null = null
  if (paymentMethod.monthly_budget && paymentMethod.monthly_budget > 0) {
    budgetPercentage = Math.round((totalSpent / paymentMethod.monthly_budget) * 100)
  }

  const executionTime = performance.now() - startTime

  // Log performance
  console.log(`Statement summary query completed in ${executionTime.toFixed(2)}ms for user ${userId}`)

  if (executionTime > 500) {
    console.warn(`⚠️ Statement summary query exceeded 500ms target: ${executionTime.toFixed(2)}ms`)
  }

  return {
    paymentMethodName: paymentMethod.name,
    periodStart,
    periodEnd,
    totalSpent,
    monthlyBudget: paymentMethod.monthly_budget,
    budgetPercentage,
    categoryBreakdown
  }
}

/**
 * Get category breakdown with transactions and installments
 *
 * @param userId - User ID
 * @param paymentMethodId - Payment method ID
 * @param periodStart - Start of statement period
 * @param periodEnd - End of statement period
 * @returns Category breakdown array sorted by amount DESC
 */
async function getCategoryBreakdown(
  userId: string,
  paymentMethodId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<CategoryBreakdown[]> {
  const startDateStr = periodStart.toISOString().split('T')[0]
  const endDateStr = periodEnd.toISOString().split('T')[0]

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
    .gte('date', startDateStr)
    .lte('date', endDateStr)

  if (txError) {
    console.error('Error querying transactions:', txError)
    throw new Error('Failed to query transactions')
  }

  // Query installment payments grouped by category
  // Only include 'pending' to avoid double-counting with payment transactions (Story 2.8)
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
    .gte('due_date', startDateStr)
    .lte('due_date', endDateStr)

  if (instError) {
    console.error('Error querying installments:', instError)
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
