/**
 * Payment Reminders Job
 *
 * Runs daily to send WhatsApp reminders for:
 * 1. Payments due tomorrow
 * 2. Overdue payments (past due date)
 *
 * Schedule: 0 8 * * * (08:00 every day)
 */

import { logger } from '../monitoring/logger.js'
import { getSupabaseClient } from '../database/supabase-client.js'
import { getSocket } from '../../index.js'
import { getUserLocale } from '../../localization/i18n.js'

export interface PaymentRemindersJobResult {
  usersProcessed: number
  remindersSent: number
  failed: number
  errors: Array<{ userId: string; error: string }>
  durationMs: number
}

// Raw type from Supabase (nested relations return as arrays)
interface RecurringPaymentRaw {
  id: string
  due_date: string
  user_id: string
  recurring_transaction: Array<{
    amount: number
    type: 'income' | 'expense'
    description: string | null
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
    amount: number
    type: 'income' | 'expense'
    description: string | null
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
 * Group payments by user
 */
function groupPaymentsByUser(payments: RecurringPayment[]): Map<string, RecurringPayment[]> {
  const grouped = new Map<string, RecurringPayment[]>()

  for (const payment of payments) {
    const userId = payment.user_id
    if (!grouped.has(userId)) {
      grouped.set(userId, [])
    }
    grouped.get(userId)!.push(payment)
  }

  return grouped
}

/**
 * Format payment info for message
 */
function formatPayment(payment: RecurringPayment): string {
  const category = payment.recurring_transaction.category
  const amount = payment.recurring_transaction.amount.toFixed(2)
  const type = payment.recurring_transaction.type
  const typeEmoji = type === 'expense' ? '💸' : '💰'

  return `${typeEmoji} ${category.icon} ${category.name}: R$ ${amount}${payment.recurring_transaction.description ? ` - ${payment.recurring_transaction.description}` : ''}`
}

/**
 * Send reminder to a user
 */
async function sendReminderToUser(
  supabase: ReturnType<typeof getSupabaseClient>,
  sock: NonNullable<ReturnType<typeof getSocket>>,
  userId: string,
  upcomingPayments: RecurringPayment[],
  overduePayments: RecurringPayment[]
): Promise<boolean> {
  try {
    // Get user's WhatsApp identifier
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
    const messageParts: string[] = []

    // Add overdue payments
    if (overduePayments.length > 0) {
      messageParts.push('⚠️ *Pagamentos atrasados:*\n')
      for (const payment of overduePayments) {
        const daysPast = Math.floor(
          (new Date().getTime() - new Date(payment.due_date).getTime()) / (1000 * 60 * 60 * 24)
        )
        messageParts.push(
          `${formatPayment(payment)} (${daysPast} ${daysPast === 1 ? 'dia' : 'dias'} atrasado)`
        )
      }
      messageParts.push('')
    }

    // Add upcoming payments
    if (upcomingPayments.length > 0) {
      messageParts.push('📅 *Pagamentos para amanhã:*\n')
      for (const payment of upcomingPayments) {
        messageParts.push(formatPayment(payment))

        // Add note if auto-pay is enabled
        if (payment.recurring_transaction.auto_pay) {
          messageParts.push('  ↳ _Pagamento automático ativado_')
        }
      }
      messageParts.push('')
    }

    // Add action prompt
    if (overduePayments.length > 0 || upcomingPayments.length > 0) {
      messageParts.push(
        '\n💡 _Acesse /recorrentes para marcar como pago ou visite o painel web para gerenciar._'
      )
    }

    const message = messageParts.join('\n')

    // Send via Baileys - prefer JID, fall back to phone number
    const jid = userProfile.whatsapp_jid || `${userProfile.whatsapp_number}@s.whatsapp.net`
    await sock.sendMessage(jid, { text: message })

    logger.debug('Payment reminder sent', {
      userId,
      upcoming: upcomingPayments.length,
      overdue: overduePayments.length,
    })

    return true
  } catch (error) {
    logger.error('Error sending reminder', { userId }, error as Error)
    return false
  }
}

/**
 * Run the payment reminders job
 */
export async function runPaymentRemindersJob(): Promise<PaymentRemindersJobResult> {
  const startTime = Date.now()
  const result: PaymentRemindersJobResult = {
    usersProcessed: 0,
    remindersSent: 0,
    failed: 0,
    errors: [],
    durationMs: 0,
  }

  logger.info('Payment reminders job started', {
    started_at: new Date().toISOString(),
  })

  try {
    const supabase = getSupabaseClient()
    const sock = getSocket()

    if (!sock || !sock.user) {
      logger.warn('WhatsApp socket not connected, skipping payment reminders')
      result.durationMs = Date.now() - startTime
      return result
    }

    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const todayStr = today.toISOString().split('T')[0]
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

    // Find payments due tomorrow (not auto-pay)
    const { data: upcomingPayments, error: upcomingError } = await supabase
      .from('recurring_payments')
      .select(`
        id,
        due_date,
        user_id,
        recurring_transaction:recurring_transactions(
          amount,
          type,
          description,
          auto_pay,
          category:categories(
            name,
            icon
          )
        )
      `)
      .eq('due_date', tomorrowStr)
      .eq('is_paid', false)

    if (upcomingError) throw upcomingError

    // Find overdue payments (not auto-pay)
    const { data: overduePayments, error: overdueError } = await supabase
      .from('recurring_payments')
      .select(`
        id,
        due_date,
        user_id,
        recurring_transaction:recurring_transactions(
          amount,
          type,
          description,
          auto_pay,
          category:categories(
            name,
            icon
          )
        )
      `)
      .lt('due_date', todayStr)
      .eq('is_paid', false)

    if (overdueError) throw overdueError

    // Normalize Supabase responses and filter out auto-pay payments
    const normalizedUpcoming = (upcomingPayments as unknown as RecurringPaymentRaw[] || [])
      .map(normalizePayment)
      .filter((p): p is RecurringPayment => p !== null)

    const normalizedOverdue = (overduePayments as unknown as RecurringPaymentRaw[] || [])
      .map(normalizePayment)
      .filter((p): p is RecurringPayment => p !== null)

    // Filter out auto-pay payments (they'll be handled automatically)
    const filteredUpcoming = normalizedUpcoming.filter(
      (p) => !p.recurring_transaction?.auto_pay
    )
    const filteredOverdue = normalizedOverdue.filter(
      (p) => !p.recurring_transaction?.auto_pay
    )

    if (filteredUpcoming.length === 0 && filteredOverdue.length === 0) {
      logger.info('No payment reminders to send')
      result.durationMs = Date.now() - startTime
      return result
    }

    logger.info('Found payments to remind', {
      upcoming: filteredUpcoming.length,
      overdue: filteredOverdue.length,
    })

    // Group by user
    const upcomingByUser = groupPaymentsByUser(filteredUpcoming)
    const overdueByUser = groupPaymentsByUser(filteredOverdue)

    // Get all unique users
    const allUsers = new Set([...upcomingByUser.keys(), ...overdueByUser.keys()])
    result.usersProcessed = allUsers.size

    logger.info('Sending reminders to users', { count: allUsers.size })

    // Send reminders to each user
    for (const userId of allUsers) {
      const upcoming = upcomingByUser.get(userId) || []
      const overdue = overdueByUser.get(userId) || []

      try {
        const success = await sendReminderToUser(supabase, sock, userId, upcoming, overdue)

        if (success) {
          result.remindersSent++
        } else {
          result.failed++
          result.errors.push({
            userId,
            error: 'Failed to send reminder',
          })
        }
      } catch (error) {
        result.failed++
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        result.errors.push({
          userId,
          error: errorMessage,
        })
        logger.error('Error sending reminder to user', { userId }, error as Error)
      }
    }
  } catch (error) {
    logger.error('Payment reminders job failed', {}, error as Error)
    throw error
  } finally {
    result.durationMs = Date.now() - startTime
    logger.info('Payment reminders job completed', {
      duration_ms: result.durationMs,
      usersProcessed: result.usersProcessed,
      remindersSent: result.remindersSent,
      failed: result.failed,
    })
  }

  return result
}
