/**
 * Statement Reminder Eligibility Query
 *
 * Identifies users eligible for statement closing reminders (3 days before closing).
 * Handles month boundaries and opt-out preferences.
 */

import { getSupabaseClient } from '../database/supabase-client.js'
import { logger } from '../monitoring/logger.js'

export interface EligibleUser {
  user_id: string
  whatsapp_jid: string | null
  whatsapp_lid: string | null
  whatsapp_number: string | null
  locale: string
  payment_method_id: string
  payment_method_name: string
  statement_closing_day: number
  monthly_budget: number | null
}

/**
 * Query users eligible for statement reminders
 *
 * Eligibility criteria:
 * - Credit Mode enabled (credit_mode = true)
 * - Statement closing day set (statement_closing_day IS NOT NULL)
 * - Statement closes in 3 days
 * - Has WhatsApp authorization (JID, LID, or phone number)
 * - Has not opted out of reminders
 *
 * Handles month boundaries correctly (e.g., Dec 29 → Jan 1)
 */
export async function getEligibleUsersForStatementReminders(): Promise<EligibleUser[]> {
  const supabase = getSupabaseClient()

  try {
    logger.debug('Querying eligible users for statement reminders')

    // Calculate the target closing date (3 days from today)
    const today = new Date()
    const targetDate = new Date(today)
    targetDate.setDate(targetDate.getDate() + 3)

    const targetDay = targetDate.getDate()

    logger.debug('Target closing day for reminders', {
      today: today.toISOString().split('T')[0],
      targetDate: targetDate.toISOString().split('T')[0],
      targetDay,
    })

    // Query for eligible users
    // Note: We check if the closing day matches 3 days from now
    // The month boundary handling is done automatically by date arithmetic
    const { data, error } = await supabase
      .from('payment_methods')
      .select(`
        id,
        name,
        statement_closing_day,
        monthly_budget,
        credit_mode,
        user_id,
        users!inner (
          id,
          whatsapp_jid,
          whatsapp_lid,
          whatsapp_number
        ),
        user_profiles!inner (
          locale,
          statement_reminders_enabled
        )
      `)
      .eq('credit_mode', true)
      .not('statement_closing_day', 'is', null)
      .eq('statement_closing_day', targetDay)

    if (error) {
      logger.error('Error querying eligible users', {}, error)
      throw error
    }

    if (!data || data.length === 0) {
      logger.info('No eligible users for statement reminders today')
      return []
    }

    // Transform and filter the results
    const eligibleUsers: EligibleUser[] = []

    for (const row of data) {
      // Check if user has WhatsApp authorization
      const user = Array.isArray(row.users) ? row.users[0] : row.users
      if (!user) continue

      const hasWhatsApp =
        user.whatsapp_jid || user.whatsapp_lid || user.whatsapp_number

      if (!hasWhatsApp) {
        logger.debug('User has no WhatsApp identifier, skipping', {
          userId: user.id,
        })
        continue
      }

      // Check opt-out preference (default to enabled if not set)
      const profile = Array.isArray(row.user_profiles)
        ? row.user_profiles[0]
        : row.user_profiles

      if (!profile) {
        logger.debug('User has no profile, skipping', { userId: user.id })
        continue
      }

      const remindersEnabled =
        profile.statement_reminders_enabled !== false // Default to true

      if (!remindersEnabled) {
        logger.debug('User has opted out of reminders, skipping', {
          userId: user.id,
        })
        continue
      }

      // User is eligible
      eligibleUsers.push({
        user_id: user.id,
        whatsapp_jid: user.whatsapp_jid,
        whatsapp_lid: user.whatsapp_lid,
        whatsapp_number: user.whatsapp_number,
        locale: profile.locale || 'pt-BR',
        payment_method_id: row.id,
        payment_method_name: row.name,
        statement_closing_day: row.statement_closing_day,
        monthly_budget: row.monthly_budget,
      })
    }

    logger.info('Found eligible users for statement reminders', {
      count: eligibleUsers.length,
      targetDay,
    })

    return eligibleUsers
  } catch (error) {
    logger.error('Failed to query eligible users', {}, error as Error)
    throw error
  }
}

/**
 * Get the WhatsApp JID for a user (prefers JID > LID > phone number)
 */
export function getUserJid(user: Pick<EligibleUser, 'whatsapp_jid' | 'whatsapp_lid' | 'whatsapp_number'>): string | null {
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
