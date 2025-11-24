/**
 * Message Router Service
 *
 * Routes messages to the correct destination (individual or group)
 * based on user preferences.
 *
 * Epic: 2 - Conversation-First Welcome
 * Story: 2.4 - Preferred Destination Auto-Detection
 */

import { logger } from '../monitoring/logger.js'
import { getSupabaseClient } from '../database/supabase-client.js'

export interface RouteResult {
  destination: 'individual' | 'group'
  destinationJid: string
  fallbackUsed: boolean
  error?: string
}

/**
 * Determine where to send a proactive message for a user
 *
 * @param userId - The user's ID
 * @returns The destination type and JID
 *
 * TODO: Full implementation in Epic 4 (Story 4.6)
 * For now, returns the preferred destination from user_profiles
 */
export async function getMessageDestination(
  userId: string
): Promise<RouteResult | null> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('user_profiles')
    .select('preferred_destination, preferred_group_jid, whatsapp_jid')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    logger.error('Error fetching message destination', { userId, error: error.message })
    return null
  }

  if (!data) {
    logger.warn('User profile not found for message destination', { userId })
    return null
  }

  const destination = (data.preferred_destination as 'individual' | 'group') || 'individual'

  // AC-4.6.1, AC-4.6.2: Route based on preferred_destination
  // AC-4.6.7: Fallback to individual if group preference but no group_jid
  let destinationJid: string
  let fallbackUsed = false

  if (destination === 'group') {
    if (data.preferred_group_jid) {
      destinationJid = data.preferred_group_jid
    } else {
      // Fallback: no group JID stored
      logger.warn('Group preference but no preferred_group_jid, falling back to individual', { userId })
      destinationJid = data.whatsapp_jid
      fallbackUsed = true
    }
  } else {
    destinationJid = data.whatsapp_jid
  }

  if (!destinationJid) {
    logger.warn('No JID found for user', { userId, destination })
    return null
  }

  logger.debug('Got message destination', { userId, destination, destinationJid, fallbackUsed })

  return {
    destination: fallbackUsed ? 'individual' : destination,
    destinationJid,
    fallbackUsed,
  }
}

/**
 * Update user's preferred destination
 *
 * AC-2.4.1: Store individual destination
 * AC-2.4.2: Store group destination with group JID
 *
 * @param userId - The user's ID
 * @param destination - The new preferred destination
 * @param jid - The JID associated with this destination
 * @returns True if updated successfully
 */
export async function setPreferredDestination(
  userId: string,
  destination: 'individual' | 'group',
  jid: string
): Promise<boolean> {
  const supabase = getSupabaseClient()

  logger.info('Setting preferred destination', {
    userId,
    destination,
    jid: jid.substring(0, 10) + '...', // Truncate for logging
  })

  const updateData: Record<string, string> = {
    preferred_destination: destination,
    updated_at: new Date().toISOString(),
  }

  // Store group JID if destination is group
  if (destination === 'group') {
    updateData.preferred_group_jid = jid
  }

  const { error } = await supabase
    .from('user_profiles')
    .update(updateData)
    .eq('id', userId)

  if (error) {
    logger.error('Error setting preferred destination', {
      userId,
      destination,
      error: error.message,
    })
    return false
  }

  logger.info('Preferred destination set successfully', { userId, destination })
  return true
}

/**
 * Auto-detect preferred destination from first message
 *
 * AC-2.4.1: Individual chat → preferred_destination = 'individual'
 * AC-2.4.2: Group chat → preferred_destination = 'group' + group JID stored
 * AC-2.4.3: Only sets if preference not already set (no auto-change)
 *
 * @param userId - The user's ID
 * @param messageSource - Where the first message came from
 * @param jid - The JID of the message source (individual or group)
 * @returns True if preference was set (false if already had preference)
 */
export async function autoDetectDestination(
  userId: string,
  messageSource: 'individual' | 'group',
  jid: string
): Promise<boolean> {
  const supabase = getSupabaseClient()

  logger.debug('Auto-detecting destination', {
    userId,
    messageSource,
    jid: jid.substring(0, 10) + '...',
  })

  // AC-2.4.3: Check if user already has a preferred destination set
  const { data: existingProfile, error: selectError } = await supabase
    .from('user_profiles')
    .select('preferred_destination')
    .eq('id', userId)
    .maybeSingle()

  if (selectError) {
    logger.error('Error checking existing destination', {
      userId,
      error: selectError.message,
    })
    return false
  }

  // If user already has a preference set (not null/undefined and not empty),
  // don't auto-change it
  if (existingProfile?.preferred_destination) {
    logger.debug('User already has preferred destination, not auto-changing', {
      userId,
      existingDestination: existingProfile.preferred_destination,
      newMessageSource: messageSource,
    })
    return false
  }

  // First-time user - set preferred destination based on message source
  logger.info('First-time user - auto-detecting preferred destination', {
    userId,
    messageSource,
  })

  return setPreferredDestination(userId, messageSource, jid)
}
