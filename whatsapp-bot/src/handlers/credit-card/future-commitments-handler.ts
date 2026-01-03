/**
 * Future Commitments Handler
 * Epic 2 Story 2.3: Future Commitments Dashboard
 *
 * Handles viewing future installment commitments via WhatsApp command
 * Shows next 12 months of pending installment obligations
 */

import { getSupabaseClient } from '../../services/database/supabase-client.js'
import { getUserSession } from '../../auth/session-manager.js'
import { logger } from '../../services/monitoring/logger.js'
import { messages as ptBR, formatHelpers as ptBRHelpers } from '../../localization/pt-br.js'
import { messages as en, formatHelpers as enHelpers } from '../../localization/en.js'
import { getUserLocale } from '../../localization/i18n.js'
import { trackEvent } from '../../analytics/index.js'
import { WhatsAppAnalyticsEvent } from '../../analytics/events.js'
import { format } from 'date-fns'

interface FutureCommitment {
  month: string // YYYY-MM
  total_due: number
  payment_count: number
}

interface MonthCommitmentDetail {
  description: string
  installment_number: number
  total_installments: number
  amount: number
}

/**
 * Handle viewing future commitments from WhatsApp
 * AC3.4: WhatsApp Support
 */
export async function handleFutureCommitments(
  whatsappNumber: string
): Promise<string> {
  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return ptBR.notAuthenticated
    }

    const locale = await getUserLocale(session.userId)
    const messages = locale === 'pt-br' ? ptBR : en
    const formatHelpers = locale === 'pt-br' ? ptBRHelpers : enHelpers

    const supabase = getSupabaseClient()

    // Query installment_payments with JOIN to installment_plans
    // Get all pending payments for next 12 months
    const { data: payments, error } = await supabase
      .from('installment_payments')
      .select(`
        due_date,
        amount,
        installment_number,
        plan:installment_plans!inner (
          id,
          user_id,
          description,
          total_installments,
          status
        )
      `)
      .eq('plan.user_id', session.userId)
      .eq('plan.status', 'active')
      .eq('status', 'pending')
      .gt('due_date', new Date().toISOString().split('T')[0])
      .order('due_date', { ascending: true })

    if (error) {
      logger.error('Error fetching future commitments', {
        userId: session.userId,
        error: error.message
      })
      return messages.futureCommitments?.error || 'Error loading commitments.'
    }

    // Empty state
    if (!payments || payments.length === 0) {
      trackEvent(
        WhatsAppAnalyticsEvent.FUTURE_COMMITMENTS_VIEWED,
        session.userId,
        {
          userId: session.userId,
          monthCount: 0,
          totalCommitment: 0,
          paymentCount: 0,
          channel: 'whatsapp',
          timestamp: new Date().toISOString()
        }
      )

      return messages.futureCommitments?.empty_state || '📊 Compromissos Futuros\n\nVocê não tem parcelamentos ativos.\n\nPara criar um parcelamento, envie:\n"gastei 600 em 3x no celular"'
    }

    // Aggregate by month and store details
    const monthlyData = new Map<string, {
      total_due: number
      payment_count: number
      details: MonthCommitmentDetail[]
    }>()

    for (const payment of payments) {
      const month = payment.due_date.substring(0, 7) // "2025-01-15" -> "2025-01"

      const current = monthlyData.get(month) || {
        total_due: 0,
        payment_count: 0,
        details: []
      }

      current.total_due += payment.amount
      current.payment_count += 1
      // Supabase returns plan as array even with !inner join
      const plan = Array.isArray(payment.plan) ? payment.plan[0] : payment.plan
      current.details.push({
        description: plan.description,
        installment_number: payment.installment_number,
        total_installments: plan.total_installments,
        amount: payment.amount
      })

      monthlyData.set(month, current)
    }

    // Convert to array and limit to 12 months
    const months = Array.from(monthlyData.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 12)

    // Build response message
    let response = `📊 ${messages.futureCommitments?.title || 'Compromissos Futuros'}\n\n`

    let totalCommitment = 0

    for (const [month, data] of months) {
      const [year, monthNum] = month.split('-').map(Number)
      const monthName = formatHelpers.getMonthName(monthNum)
      const monthAbbr = monthName.substring(0, 3) // "Janeiro" -> "Jan"

      totalCommitment += data.total_due

      // Month summary line
      const monthSummaryText = messages.futureCommitments?.month_summary
        ? messages.futureCommitments.month_summary(
            monthAbbr,
            year.toString(),
            data.total_due,
            data.payment_count
          )
        : `📅 ${monthAbbr}/${year}: ${formatHelpers.formatCurrency(data.total_due)} (${data.payment_count} ${data.payment_count === 1 ? 'parcela' : 'parcelas'})`

      response += monthSummaryText + '\n'

      // Individual installments
      for (const detail of data.details) {
        const itemText = messages.futureCommitments?.installment_item
          ? messages.futureCommitments.installment_item(
              detail.description,
              detail.installment_number,
              detail.total_installments,
              detail.amount
            )
          : `  • ${detail.description}: ${detail.installment_number}/${detail.total_installments} - ${formatHelpers.formatCurrency(detail.amount)}`

        response += itemText + '\n'
      }

      response += '\n'
    }

    // Total summary
    const totalText = messages.futureCommitments?.total_next_months
      ? messages.futureCommitments.total_next_months(months.length, totalCommitment)
      : `Total próximos ${months.length} meses: ${formatHelpers.formatCurrency(totalCommitment)}`

    response += totalText

    // Track analytics
    trackEvent(
      WhatsAppAnalyticsEvent.FUTURE_COMMITMENTS_VIEWED,
      session.userId,
      {
        userId: session.userId,
        monthCount: months.length,
        totalCommitment,
        paymentCount: payments.length,
        channel: 'whatsapp',
        timestamp: new Date().toISOString()
      }
    )

    return response

  } catch (error) {
    logger.error('Unexpected error handling future commitments', {
      whatsappNumber,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return ptBR.genericError
  }
}
