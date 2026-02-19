/**
 * Auto-Pay Execution Job
 *
 * Runs daily to automatically create transactions for recurring payments
 * that are due today and have auto_pay enabled.
 *
 * Also sends WhatsApp notifications to users about the auto-created expenses.
 *
 * Schedule: 0 6 * * * (06:00 every day)
 */

import { logger } from '../monitoring/logger.js'
import { getSupabaseClient } from '../database/supabase-client.js'
import { getSocket } from '../../index.js'
import { getUserLocale } from '../../localization/i18n.js'
import { messages as ptBRMessages } from '../../localization/pt-br.js'
import { messages as enMessages } from '../../localization/en.js'
import { resolvePaymentMethodId } from '../../utils/resolve-payment-method.js'

export interface AutoPayJobResult {
  processed: number
  succeeded: number
  failed: number
  notificationsSent: number
  errors: Array<{ paymentId: string; error: string }>
  durationMs: number
}

// Raw type from Supabase (nested relations return as arrays)
interface RecurringPaymentRaw {
  id: string
  due_date: string
  user_id: string
  recurring_transaction: Array<{
    id: string
    user_id: string
    amount: number
    type: 'income' | 'expense'
    category_id: string
    description: string | null
    payment_method: string | null
    auto_pay: boolean
    category: Array<{
      name: string
      icon: string
    }>
  }>
}

// Normalized type for easier access
interface RecurringPayment {
  id: string
  due_date: string
  user_id: string
  recurring_transaction: {
    id: string
    user_id: string
    amount: number
    type: 'income' | 'expense'
    category_id: string
    description: string | null
    payment_method: string | null
    auto_pay: boolean
    category: {
      name: string
      icon: string
    }
  }
}

// Helper to normalize Supabase response
function normalizePayment(raw: RecurringPaymentRaw): RecurringPayment | null {
  const rt = raw.recurring_transaction?.[0]
  if (!rt) return null

  return {
    id: raw.id,
    due_date: raw.due_date,
    user_id: raw.user_id,
    recurring_transaction: {
      ...rt,
      category: rt.category?.[0] || { name: 'Unknown', icon: '📦' },
    },
  }
}

/**
 * Create a transaction from a recurring payment
 */
async function createTransactionFromPayment(
  supabase: ReturnType<typeof getSupabaseClient>,
  payment: RecurringPayment
): Promise<{ id: string; user_readable_id: string }> {
  // Generate user-readable ID
  const { data: readableIdData, error: idError } = await supabase.rpc('generate_transaction_id')

  if (idError) {
    throw idError
  }

  // Map payment_method TEXT to payment_method_id UUID
  const paymentMethodId = await resolvePaymentMethodId(
    supabase,
    payment.user_id,
    payment.recurring_transaction.payment_method,
  )

  // Create the transaction
  const { data: transaction, error: transactionError } = await supabase
    .from('transactions')
    .insert({
      user_id: payment.user_id,
      amount: payment.recurring_transaction.amount,
      type: payment.recurring_transaction.type,
      category_id: payment.recurring_transaction.category_id,
      description: payment.recurring_transaction.description,
      payment_method_id: paymentMethodId,
      date: payment.due_date,
      user_readable_id: readableIdData,
    })
    .select()
    .single()

  if (transactionError) {
    throw transactionError
  }

  // Update the recurring payment as paid
  const { error: updateError } = await supabase
    .from('recurring_payments')
    .update({
      is_paid: true,
      paid_date: new Date().toISOString().split('T')[0],
      transaction_id: transaction.id,
    })
    .eq('id', payment.id)

  if (updateError) {
    throw updateError
  }

  return transaction
}

/**
 * Send WhatsApp notification about auto-created expense
 */
async function sendAutoPayNotification(
  supabase: ReturnType<typeof getSupabaseClient>,
  sock: NonNullable<ReturnType<typeof getSocket>>,
  userId: string,
  payment: RecurringPayment,
  transactionId: string
): Promise<boolean> {
  try {
    // Get user's WhatsApp number
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('whatsapp_number, whatsapp_jid')
      .eq('user_id', userId)
      .single()

    if (!userProfile?.whatsapp_number && !userProfile?.whatsapp_jid) {
      logger.warn('No WhatsApp identifier found for user', { userId })
      return false
    }

    const locale = await getUserLocale(userId)
    const category = payment.recurring_transaction.category
    const amount = payment.recurring_transaction.amount.toFixed(2)
    const type = payment.recurring_transaction.type

    // Get localized messages
    const messages = locale === 'pt-br' ? ptBRMessages : enMessages

    // Build notification message
    const message = (messages as any).recurringAutoPayNotification({
      type: type === 'expense' ? '💸' : '💰',
      typeLabel: type === 'expense' ? (locale === 'pt-br' ? 'Despesa' : 'Expense') : (locale === 'pt-br' ? 'Receita' : 'Income'),
      amount: `R$ ${amount}`,
      category: `${category.icon} ${category.name}`,
      description: payment.recurring_transaction.description || '',
      date: payment.due_date,
      transactionId: transactionId,
    })

    // Send via Baileys - prefer JID, fall back to phone number
    const jid = userProfile.whatsapp_jid || `${userProfile.whatsapp_number}@s.whatsapp.net`
    await sock.sendMessage(jid, { text: message })

    logger.debug('Auto-pay notification sent', { userId, jid })
    return true
  } catch (error) {
    logger.error('Error sending auto-pay notification', { userId }, error as Error)
    return false
  }
}

/**
 * Run the auto-payments job
 */
export async function runAutoPaymentsJob(): Promise<AutoPayJobResult> {
  const startTime = Date.now()
  const result: AutoPayJobResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    notificationsSent: 0,
    errors: [],
    durationMs: 0,
  }

  logger.info('Auto-payments job started', {
    started_at: new Date().toISOString(),
  })

  try {
    const supabase = getSupabaseClient()
    const sock = getSocket()

    const today = new Date().toISOString().split('T')[0]

    // Find all recurring payments due today with auto_pay enabled
    const { data: payments, error } = await supabase
      .from('recurring_payments')
      .select(`
        id,
        due_date,
        user_id,
        recurring_transaction:recurring_transactions(
          id,
          user_id,
          amount,
          type,
          category_id,
          description,
          payment_method,
          auto_pay,
          category:categories(
            name,
            icon
          )
        )
      `)
      .eq('due_date', today)
      .eq('is_paid', false)

    if (error) {
      throw error
    }

    if (!payments || payments.length === 0) {
      logger.info('No payments due today')
      result.durationMs = Date.now() - startTime
      return result
    }

    // Normalize and filter for auto_pay enabled
    const normalizedPayments = (payments as unknown as RecurringPaymentRaw[])
      .map(normalizePayment)
      .filter((p): p is RecurringPayment => p !== null)

    const autoPayPayments = normalizedPayments.filter(
      (p) => p.recurring_transaction?.auto_pay === true
    )

    if (autoPayPayments.length === 0) {
      logger.info('No auto-pay payments due today', {
        totalDue: payments.length,
      })
      result.durationMs = Date.now() - startTime
      return result
    }

    logger.info('Processing auto-pay payments', { count: autoPayPayments.length })

    // Process each payment
    for (const payment of autoPayPayments) {
      result.processed++

      try {
        const transaction = await createTransactionFromPayment(supabase, payment)
        result.succeeded++

        logger.info('Created auto-pay transaction', {
          paymentId: payment.id,
          transactionId: transaction.user_readable_id,
          userId: payment.user_id,
          category: payment.recurring_transaction.category.name,
        })

        // Send WhatsApp notification if socket is connected
        if (sock && sock.user) {
          const notificationSent = await sendAutoPayNotification(
            supabase,
            sock,
            payment.user_id,
            payment,
            transaction.user_readable_id
          )
          if (notificationSent) {
            result.notificationsSent++
          }
        }
      } catch (error) {
        result.failed++
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        result.errors.push({
          paymentId: payment.id,
          error: errorMessage,
        })
        logger.error('Failed to process auto-pay payment', {
          paymentId: payment.id,
          userId: payment.user_id,
        }, error as Error)
      }
    }
  } catch (error) {
    logger.error('Auto-payments job failed', {}, error as Error)
    throw error
  } finally {
    result.durationMs = Date.now() - startTime
    logger.info('Auto-payments job completed', {
      duration_ms: result.durationMs,
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      notificationsSent: result.notificationsSent,
    })
  }

  return result
}
