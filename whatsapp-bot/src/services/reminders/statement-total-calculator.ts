/**
 * Statement Total Calculator
 *
 * Story 4.2: Payment Due Reminder - WhatsApp
 *
 * Calculates statement total (regular expenses + installment payments) for payment reminders.
 * Reuses logic from Story 3.5 (statement summary service) for consistency.
 *
 * Performance Target: < 500ms (NFR-Epic4-P2)
 */

import { getSupabaseClient } from '../database/supabase-client.js'
import { logger } from '../monitoring/logger.js'

/**
 * Calculate total spent in a statement period
 *
 * NOTE: Simplified after Epic 2 changes - installments now create transactions upfront.
 * Total = All expense transactions in period (including installment-sourced transactions)
 *
 * @param userId - User ID
 * @param paymentMethodId - Payment method ID
 * @param periodStart - Start date of statement period
 * @param periodEnd - End date of statement period
 * @returns Total amount spent (all transactions)
 */
export async function calculateStatementTotal(
  userId: string,
  paymentMethodId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  const startTime = performance.now()
  const supabase = getSupabaseClient()

  try {
    const startDateStr = periodStart.toISOString().split('T')[0]
    const endDateStr = periodEnd.toISOString().split('T')[0]

    logger.debug('Calculating statement total', {
      userId,
      paymentMethodId,
      periodStart: startDateStr,
      periodEnd: endDateStr,
    })

    // Query all expense transactions (including installment-sourced transactions)
    const { data: transactionData, error: txError } = await supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('payment_method_id', paymentMethodId)
      .eq('type', 'expense')
      .gte('date', startDateStr)
      .lte('date', endDateStr)

    if (txError) {
      logger.error('Error querying transactions for statement total', {
        userId,
        paymentMethodId,
      }, txError)
      throw new Error('Failed to query transactions')
    }

    // Calculate total from all transactions
    const total = transactionData?.reduce((sum, tx) => sum + tx.amount, 0) || 0

    const executionTime = performance.now() - startTime

    logger.debug('Statement total calculated', {
      userId,
      paymentMethodId,
      transactionCount: transactionData?.length || 0,
      total,
      executionTime: `${executionTime.toFixed(2)}ms`,
    })

    if (executionTime > 500) {
      logger.warn('Statement total calculation exceeded 500ms target', {
        userId,
        paymentMethodId,
        executionTime: `${executionTime.toFixed(2)}ms`,
      })
    }

    return total
  } catch (error) {
    logger.error('Failed to calculate statement total', {
      userId,
      paymentMethodId,
    }, error as Error)
    throw error
  }
}
