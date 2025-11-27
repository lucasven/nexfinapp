/**
 * Destination Handler
 *
 * Handles user requests to switch their preferred message destination
 * between individual chat and group chat.
 *
 * Epic: 4 - Engagement State Machine
 * Story: 4.6 - Message Routing Service
 *
 * AC-4.6.3: User can send "mudar para grupo" / "switch to group"
 * AC-4.6.4: User can send "mudar para individual" / "switch to private"
 * AC-4.6.5: Preference change sends localized confirmation message
 */

import { logger } from '../../services/monitoring/logger.js'
import { setPreferredDestination } from '../../services/engagement/message-router.js'
import { getSupabaseClient } from '../../services/database/supabase-client.js'
import { messages as ptBrMessages } from '../../localization/pt-br.js'
import { messages as enMessages } from '../../localization/en.js'

// =============================================================================
// Destination Switch Command Patterns (Story 4.6)
// AC-4.6.3, AC-4.6.4: Case-insensitive matching with generous variations
// =============================================================================

/**
 * Patterns for switching to group destination
 * AC-4.6.3: "mudar para grupo" / "switch to group"
 */
const SWITCH_TO_GROUP_PATTERNS = [
  /mudar\s+para\s+(o\s+)?grupo/i,
  /trocar\s+para\s+(o\s+)?grupo/i,
  /mensagens?\s+(no|em|para)\s+(o\s+)?grupo/i,
  /switch\s+to\s+group/i,
  /messages?\s+in\s+group/i,
  /group\s+messages/i,
]

/**
 * Patterns for switching to individual destination
 * AC-4.6.4: "mudar para individual" / "switch to private"
 */
const SWITCH_TO_INDIVIDUAL_PATTERNS = [
  /mudar\s+para\s+(o\s+)?individual/i,
  /mudar\s+para\s+(o\s+)?privado/i,
  /trocar\s+para\s+(o\s+)?privado/i,
  /trocar\s+para\s+(o\s+)?individual/i,
  /mensagens?\s+privadas?/i,
  /mensagens?\s+(no|em|para)\s+(o\s+)?privado/i,
  /switch\s+to\s+(individual|private)/i,
  /private\s+messages?/i,
]

export type DestinationSwitchCommand = 'group' | 'individual' | null

/**
 * Check if a message is a destination switch command
 *
 * AC-4.6.3: "mudar para grupo" → 'group'
 * AC-4.6.4: "mudar para individual" → 'individual'
 *
 * @param messageText - The incoming message text
 * @returns 'group' | 'individual' | null
 */
export function isDestinationSwitchCommand(
  messageText: string
): DestinationSwitchCommand {
  const normalized = messageText.trim()

  // Check group patterns first
  if (SWITCH_TO_GROUP_PATTERNS.some((p) => p.test(normalized))) {
    return 'group'
  }

  // Check individual patterns
  if (SWITCH_TO_INDIVIDUAL_PATTERNS.some((p) => p.test(normalized))) {
    return 'individual'
  }

  return null
}

export interface DestinationSwitchContext {
  userId: string
  messageSource: 'individual' | 'group'
  groupJid?: string
  locale: 'pt-BR' | 'en'
}

export interface DestinationSwitchResult {
  success: boolean
  newDestination: 'individual' | 'group'
  message: string
}

/**
 * Get localized messages for the user's locale
 */
function getMessages(locale: 'pt-BR' | 'en') {
  return locale === 'pt-BR' ? ptBrMessages : enMessages
}

/**
 * Get localized confirmation messages for destination switching
 * AC-4.6.5: Preference change sends localized confirmation message
 */
function getConfirmationMessage(
  destination: 'individual' | 'group',
  locale: 'pt-BR' | 'en',
  error?: boolean
): string {
  const messages = getMessages(locale)

  if (error) {
    return messages.engagementDestinationSwitchFailed
  }

  if (destination === 'group') {
    return messages.engagementDestinationSwitchedToGroup
  } else {
    return messages.engagementDestinationSwitchedToIndividual
  }
}

/**
 * Handle destination switch command
 *
 * AC-4.6.3: Switch to group
 * AC-4.6.4: Switch to individual
 * AC-4.6.5: Send localized confirmation
 *
 * @param userId - The user's ID
 * @param messageText - Raw message text
 * @param context - Context including message source and group JID
 * @returns Result with success status and confirmation message, or null if not a switch command
 */
export async function handleDestinationSwitch(
  userId: string,
  messageText: string,
  context: DestinationSwitchContext
): Promise<DestinationSwitchResult | null> {
  const command = isDestinationSwitchCommand(messageText)

  if (!command) {
    return null
  }

  logger.info('Processing destination switch command', {
    userId,
    command,
    currentSource: context.messageSource,
    hasGroupJid: !!context.groupJid,
  })

  try {
    // Determine the JID to use
    let jidToStore: string

    if (command === 'group') {
      // Switching to group - need a group JID
      if (context.groupJid) {
        // User sent this command from a group, use that group's JID
        jidToStore = context.groupJid
      } else if (context.messageSource === 'group') {
        // Message came from group but groupJid not explicitly passed
        // This shouldn't happen in well-formed calls
        logger.warn('Group switch requested but no groupJid in context', { userId })
        return {
          success: false,
          newDestination: command,
          message: getConfirmationMessage(command, context.locale, true),
        }
      } else {
        // User sent from individual chat but wants group messages
        // Check if they have a previously stored group JID
        const supabase = getSupabaseClient()
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('preferred_group_jid')
          .eq('user_id', userId)
          .maybeSingle()

        if (profile?.preferred_group_jid) {
          jidToStore = profile.preferred_group_jid
        } else {
          // No group JID available - need to send from group first
          logger.info('User wants group destination but no group JID available', { userId })
          const messages = getMessages(context.locale)
          return {
            success: false,
            newDestination: command,
            message: messages.engagementDestinationNeedGroupFirst,
          }
        }
      }
    } else {
      // Switching to individual - use individual JID from profile
      const supabase = getSupabaseClient()
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('whatsapp_jid')
        .eq('user_id', userId)
        .maybeSingle()

      if (!profile?.whatsapp_jid) {
        logger.error('No individual JID found for user', { userId })
        return {
          success: false,
          newDestination: command,
          message: getConfirmationMessage(command, context.locale, true),
        }
      }

      jidToStore = profile.whatsapp_jid
    }

    // Update the preference
    const success = await setPreferredDestination(userId, command, jidToStore)

    if (!success) {
      return {
        success: false,
        newDestination: command,
        message: getConfirmationMessage(command, context.locale, true),
      }
    }

    logger.info('Destination preference updated', { userId, newDestination: command })

    return {
      success: true,
      newDestination: command,
      message: getConfirmationMessage(command, context.locale),
    }
  } catch (error) {
    logger.error('Error handling destination switch', { userId }, error as Error)
    return {
      success: false,
      newDestination: command,
      message: getConfirmationMessage(command, context.locale, true),
    }
  }
}
