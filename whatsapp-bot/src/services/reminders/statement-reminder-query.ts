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

    // Query for eligible payment methods first
    // Note: We check if the closing day matches 3 days from now
    // The month boundary handling is done automatically by date arithmetic
    const { data: paymentMethods, error: pmError } = await supabase
      .from('payment_methods')
      .select(`
        id,
        name,
        statement_closing_day,
        monthly_budget,
        credit_mode,
        user_id
      `)
      .eq('credit_mode', true)
      .not('statement_closing_day', 'is', null)
      .eq('statement_closing_day', targetDay)

    if (pmError) {
      logger.error('Error querying eligible users', {}, pmError)
      throw pmError
    }

    if (!paymentMethods || paymentMethods.length === 0) {
      logger.info('No eligible users for statement reminders today')
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
      .select('user_id, locale, statement_reminders_enabled')
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

    const profileMap = new Map<string, { locale: string; remindersEnabled: boolean }>()
    for (const profile of profiles || []) {
      profileMap.set(profile.user_id, {
        locale: profile.locale || 'pt-BR',
        remindersEnabled: profile.statement_reminders_enabled !== false
      })
    }

    // Transform and filter the results
    const eligibleUsers: EligibleUser[] = []

    for (const row of paymentMethods) {
      const userId = row.user_id

      // Check if user has WhatsApp authorization
      const waInfo = whatsappMap.get(userId)
      if (!waInfo || (!waInfo.jid && !waInfo.lid && !waInfo.number)) {
        logger.debug('User has no WhatsApp identifier, skipping', {
          userId,
        })
        continue
      }

      // Check opt-out preference (default to enabled if not set)
      const profile = profileMap.get(userId)
      if (!profile) {
        logger.debug('User has no profile, skipping', { userId })
        continue
      }

      if (!profile.remindersEnabled) {
        logger.debug('User has opted out of reminders, skipping', {
          userId,
        })
        continue
      }

      // User is eligible
      eligibleUsers.push({
        user_id: userId,
        whatsapp_jid: waInfo.jid,
        whatsapp_lid: waInfo.lid,
        whatsapp_number: waInfo.number,
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
