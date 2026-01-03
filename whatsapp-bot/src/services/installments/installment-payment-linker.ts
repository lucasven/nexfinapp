/**
 * Installment Payment Linker
 *
 * Helper service to automatically link transactions to pending installment payments.
 * Shared logic for WhatsApp bot to match frontend implementation.
 */

import { getSupabaseClient } from '../database/supabase-client.js'
import { logger } from '../monitoring/logger.js'
import { trackEvent } from '../../analytics/index.js'
import { WhatsAppAnalyticsEvent } from '../../analytics/events.js'

export interface InstallmentLinkResult {
  success: boolean
  paymentId?: string
  error?: string
}

/**
 * Link transaction to pending installment payment
 *
 * Automatically links a transaction to a pending installment payment if:
 * - Payment method matches
 * - Due date matches transaction date (±3 days tolerance)
 * - Amount matches (±1% tolerance)
 * - Status is 'pending'
 *
 * @param transactionId - Transaction ID to link
 * @param paymentMethodId - Payment method ID
 * @param transactionDate - Transaction date (YYYY-MM-DD)
 * @param amount - Transaction amount
 * @param userId - User ID (for analytics)
 * @returns Success boolean and payment ID if linked
 */
export async function linkTransactionToInstallmentPayment(
  transactionId: string,
  paymentMethodId: string,
  transactionDate: string,
  amount: number,
  userId: string
): Promise<InstallmentLinkResult> {
  const supabase = getSupabaseClient()

  try {
    // Find pending installment payment matching criteria
    // Date tolerance: ±3 days
    // Amount tolerance: ±1%
    const dateLower = new Date(transactionDate)
    dateLower.setDate(dateLower.getDate() - 3)
    const dateUpper = new Date(transactionDate)
    dateUpper.setDate(dateUpper.getDate() + 3)

    const amountLower = amount * 0.99
    const amountUpper = amount * 1.01

    const { data: payments, error: queryError } = await supabase
      .from('installment_payments')
      .select(`
        id,
        plan_id,
        amount,
        due_date,
        installment_plans!inner (
          user_id,
          payment_method_id
        )
      `)
      .eq('installment_plans.user_id', userId)
      .eq('installment_plans.payment_method_id', paymentMethodId)
      .eq('status', 'pending')
      .gte('due_date', dateLower.toISOString().split('T')[0])
      .lte('due_date', dateUpper.toISOString().split('T')[0])
      .gte('amount', amountLower)
      .lte('amount', amountUpper)
      .order('due_date', { ascending: true })
      .limit(1)

    if (queryError) {
      logger.error('Error querying installment payments', { userId, transactionId }, queryError)
      return { success: false, error: queryError.message }
    }

    // No matching payment found - this is OK, not all transactions are installments
    if (!payments || payments.length === 0) {
      return { success: true }
    }

    const payment = payments[0]

    // Link transaction to payment and mark as paid
    const { error: updateError } = await supabase
      .from('installment_payments')
      .update({
        transaction_id: transactionId,
        status: 'paid',
        updated_at: new Date().toISOString()
      })
      .eq('id', payment.id)

    if (updateError) {
      logger.error('Error linking transaction to payment', { userId, transactionId, paymentId: payment.id }, updateError)
      return { success: false, error: updateError.message }
    }

    logger.info('Transaction linked to installment payment', {
      userId,
      transactionId,
      paymentId: payment.id,
      planId: payment.plan_id,
      amount: payment.amount,
      dueDate: payment.due_date
    })

    // Track analytics event
    trackEvent(WhatsAppAnalyticsEvent.INSTALLMENT_PAYMENT_LINKED_AUTO, userId, {
      userId,
      transactionId,
      paymentId: payment.id,
      amount,
      trigger: 'whatsapp_transaction_create',
      timestamp: new Date().toISOString()
    })

    return { success: true, paymentId: payment.id }

  } catch (error) {
    logger.error('Unexpected error linking transaction', { userId, transactionId }, error as Error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unexpected error'
    }
  }
}
