/**
 * Payment Reminder Eligibility Query
 *
 * Story 4.2: Payment Due Reminder - WhatsApp
 *
 * Identifies users eligible for credit card payment reminders (2 days before payment due).
 * Handles month boundaries, year boundaries, and opt-out preferences.
 *
 * Eligibility Criteria:
 * - Credit Mode enabled (credit_mode = true)
 * - Statement closing day set (statement_closing_day IS NOT NULL)
 * - Payment due day set (payment_due_day IS NOT NULL)
 * - Payment due in exactly 2 days
 * - Has WhatsApp authorization (JID, LID, or phone number)
 * - Has not opted out of payment reminders (payment_reminders_enabled != false)
 */

import { getSupabaseClient } from '../database/supabase-client.js'
import { logger } from '../monitoring/logger.js'

export interface EligiblePaymentReminder {
  user_id: string
  payment_method_id: string
  payment_method_name: string
  whatsapp_jid: string | null
  whatsapp_lid: string | null
  whatsapp_number: string | null
  user_locale: 'pt-BR' | 'en'
  statement_closing_day: number
  payment_due_day: number
  due_date: Date
  statement_period_start: Date
  statement_period_end: Date
}

/**
 * Calculate the payment due date for a payment method
 *
 * Logic:
 * 1. Get the current statement period using calculate_statement_period()
 * 2. Add payment_due_day to the period_end (closing date)
 * 3. Handle month/year boundaries correctly
 *
 * Example:
 * - closing_day = 5, payment_due_day = 10
 * - Period ends on Jan 5
 * - Payment due on Jan 15 (5 + 10)
 *
 * Edge case:
 * - closing_day = 25, payment_due_day = 10
 * - Period ends on Dec 25
 * - Payment due on Jan 4 (25 + 10 = 35 → next month, 35 - 31 = 4)
 */
function calculateDueDate(periodEnd: Date, paymentDueDay: number): Date {
  const dueDate = new Date(periodEnd)
  dueDate.setDate(dueDate.getDate() + paymentDueDay)
  return dueDate
}

/**
 * Query users eligible for payment reminders
 *
 * Returns users with credit card payments due in exactly 2 days.
 * Excludes Simple Mode users, users without payment_due_day set,
 * and users who have opted out of payment reminders.
 *
 * Performance: < 500ms (target)
 */
export async function getEligiblePaymentReminders(): Promise<EligiblePaymentReminder[]> {
  const supabase = getSupabaseClient()

  try {
    const startTime = performance.now()

    logger.debug('Querying eligible users for payment reminders')

    // Calculate target date (2 days from today)
    const today = new Date()
    const targetDate = new Date(today)
    targetDate.setDate(targetDate.getDate() + 2)
    const targetDateStr = targetDate.toISOString().split('T')[0]

    logger.debug('Target due date for payment reminders', {
      today: today.toISOString().split('T')[0],
      targetDate: targetDateStr,
    })

    // Query for eligible payment methods first
    // Note: We filter for credit_mode=true, payment_due_day IS NOT NULL
    const { data: paymentMethods, error: pmError } = await supabase
      .from('payment_methods')
      .select(`
        id,
        name,
        statement_closing_day,
        payment_due_day,
        credit_mode,
        user_id
      `)
      .eq('credit_mode', true)
      .not('statement_closing_day', 'is', null)
      .not('payment_due_day', 'is', null)

    if (pmError) {
      logger.error('Error querying eligible users for payment reminders', {}, pmError)
      throw pmError
    }

    if (!paymentMethods || paymentMethods.length === 0) {
      logger.info('No payment methods with payment_due_day set')
      return []
    }

    // Get unique user IDs
    const userIds = [...new Set(paymentMethods.map(pm => pm.user_id))]

    // Query authorized_whatsapp_numbers for WhatsApp identifiers
    const { data: whatsappData, error: waError } = await supabase
      .from('authorized_whatsapp_numbers')
      .select('user_id, whatsapp_jid, whatsapp_lid, whatsapp_number, is_primary')
      .in('user_id', userIds)
      .order('is_primary', { ascending: false })

    if (waError) {
      logger.error('Error querying WhatsApp numbers', {}, waError)
      throw waError
    }

    // Query user_profiles for locale and preferences
    const { data: profiles, error: profileError } = await supabase
      .from('user_profiles')
      .select('user_id, locale, payment_reminders_enabled')
      .in('user_id', userIds)

    if (profileError) {
      logger.error('Error querying user profiles', {}, profileError)
      throw profileError
    }

    // Build lookup maps for user data
    // For WhatsApp, prefer primary number, then first available
    const whatsappMap = new Map<string, { jid: string | null; lid: string | null; number: string | null }>()
    for (const wa of whatsappData || []) {
      // Only set if not already set (first entry per user is primary or earliest)
      if (!whatsappMap.has(wa.user_id)) {
        whatsappMap.set(wa.user_id, {
          jid: wa.whatsapp_jid,
          lid: wa.whatsapp_lid,
          number: wa.whatsapp_number
        })
      }
    }

    const profileMap = new Map<string, { locale: string; paymentRemindersEnabled: boolean }>()
    for (const profile of profiles || []) {
      profileMap.set(profile.user_id, {
        locale: profile.locale || 'pt-BR',
        paymentRemindersEnabled: profile.payment_reminders_enabled !== false
      })
    }

    // Transform and filter the results
    const eligibleUsers: EligiblePaymentReminder[] = []

    for (const row of paymentMethods) {
      try {
        const userId = row.user_id

        // Check if user has WhatsApp authorization
        const waInfo = whatsappMap.get(userId)
        if (!waInfo || (!waInfo.jid && !waInfo.lid && !waInfo.number)) {
          logger.debug('User has no WhatsApp identifier, skipping', {
            userId,
          })
          continue
        }

        // Check user profile exists
        const profile = profileMap.get(userId)
        if (!profile) {
          logger.debug('User has no profile, skipping', { userId })
          continue
        }

        // Check opt-out preference for payment reminders
        // Default to enabled if not explicitly set to false
        if (!profile.paymentRemindersEnabled) {
          logger.debug('User has opted out of payment reminders, skipping', {
            userId,
          })
          continue
        }

        // Calculate statement period for this payment method
        const { data: periodData, error: periodError } = await supabase.rpc(
          'calculate_statement_period',
          {
            p_closing_day: row.statement_closing_day,
            p_reference_date: today.toISOString().split('T')[0],
          }
        )

        if (periodError || !periodData || periodData.length === 0) {
          logger.warn('Failed to calculate statement period for payment method', {
            paymentMethodId: row.id,
            error: periodError,
          })
          continue
        }

        // Extract first row from TABLE result
        const period = periodData[0]
        const periodStart = new Date(period.period_start)
        const periodEnd = new Date(period.period_end)

        // Calculate payment due date
        const dueDate = calculateDueDate(periodEnd, row.payment_due_day)
        const dueDateStr = dueDate.toISOString().split('T')[0]

        // Check if payment is due in exactly 2 days
        if (dueDateStr !== targetDateStr) {
          logger.debug('Payment not due in 2 days, skipping', {
            paymentMethodId: row.id,
            dueDate: dueDateStr,
            targetDate: targetDateStr,
          })
          continue
        }

        // User is eligible for payment reminder
        eligibleUsers.push({
          user_id: userId,
          payment_method_id: row.id,
          payment_method_name: row.name,
          whatsapp_jid: waInfo.jid,
          whatsapp_lid: waInfo.lid,
          whatsapp_number: waInfo.number,
          user_locale: (profile.locale as 'pt-BR' | 'en') || 'pt-BR',
          statement_closing_day: row.statement_closing_day,
          payment_due_day: row.payment_due_day,
          due_date: dueDate,
          statement_period_start: periodStart,
          statement_period_end: periodEnd,
        })
      } catch (error) {
        logger.error('Error processing payment method for reminders', {
          paymentMethodId: row.id,
        }, error as Error)
        continue
      }
    }

    const executionTime = performance.now() - startTime

    logger.info('Found eligible users for payment reminders', {
      count: eligibleUsers.length,
      targetDate: targetDateStr,
      executionTime: `${executionTime.toFixed(2)}ms`,
    })

    if (executionTime > 500) {
      logger.warn('Payment reminder eligibility query exceeded 500ms target', {
        executionTime: `${executionTime.toFixed(2)}ms`,
      })
    }

    return eligibleUsers
  } catch (error) {
    logger.error('Failed to query eligible users for payment reminders', {}, error as Error)
    throw error
  }
}

/**
 * Get the WhatsApp JID for a user (prefers JID > LID > phone number)
 *
 * Multi-identifier cascade for maximum delivery success rate.
 */
export function getPaymentReminderJid(
  user: Pick<EligiblePaymentReminder, 'whatsapp_jid' | 'whatsapp_lid' | 'whatsapp_number'>
): string | null {
  if (user.whatsapp_jid) {
    return user.whatsapp_jid
  }

  if (user.whatsapp_lid) {
    return user.whatsapp_lid
  }

  if (user.whatsapp_number) {
    // Convert phone number to WhatsApp JID format
    return `${user.whatsapp_number}@s.whatsapp.net`
  }

  return null
}
