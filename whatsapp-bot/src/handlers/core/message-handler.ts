/**
 * Message Handler V2
 * Simplified 3-layer architecture: Explicit Commands → Cache → LLM
 * Main entry point that delegates to text-handler and image-handler
 */

import { MessageContext } from '../../types.js'
import { logger } from '../../services/monitoring/logger.js'
import { isGroupAuthorized, updateGroupLastMessage } from '../../services/groups/group-manager.js'
import { handleTextMessage } from './text-handler.js'
import { handleImageMessage } from './image-handler.js'
import { trackEvent, hashSensitiveData } from '../../analytics/index.js'
import { WhatsAppAnalyticsEvent, WhatsAppAnalyticsProperty } from '../../analytics/events.js'

export async function handleMessage(context: MessageContext): Promise<string | string[] | null> {
  const { from, isGroup, groupJid, groupName, message, hasImage, imageBuffer, quotedMessage, userIdentifiers } = context

  // Track message received event
  const messageType = hasImage ? 'image' : 'text'
  const distinctId = hashSensitiveData(from)

  if (isGroup && groupJid) {
    trackEvent(
      WhatsAppAnalyticsEvent.WHATSAPP_GROUP_MESSAGE_RECEIVED,
      distinctId,
      {
        [WhatsAppAnalyticsProperty.MESSAGE_TYPE]: messageType,
        [WhatsAppAnalyticsProperty.IS_GROUP_MESSAGE]: true,
        [WhatsAppAnalyticsProperty.GROUP_JID]: hashSensitiveData(groupJid),
        [WhatsAppAnalyticsProperty.GROUP_NAME]: groupName || 'unknown',
        [WhatsAppAnalyticsProperty.MESSAGE_LENGTH]: message?.length || 0,
      }
    )
  } else {
    trackEvent(
      WhatsAppAnalyticsEvent.WHATSAPP_MESSAGE_RECEIVED,
      distinctId,
      {
        [WhatsAppAnalyticsProperty.MESSAGE_TYPE]: messageType,
        [WhatsAppAnalyticsProperty.IS_GROUP_MESSAGE]: false,
        [WhatsAppAnalyticsProperty.MESSAGE_LENGTH]: message?.length || 0,
      }
    )
  }

  if(!isGroup)
    logger.info('Message received', {
      from,
      isGroup,
      groupJid,
      groupName,
      hasImage,
      hasQuote: !!quotedMessage,
      messageLength: message?.length || 0
    })

  // Check group authorization if message is from a group
  let groupOwnerId: string | null = null
  if (isGroup && groupJid) {
    groupOwnerId = await isGroupAuthorized(groupJid)
    
    if (!groupOwnerId) {
      // logger.info('Ignoring message from unauthorized group', { groupJid, groupName })
      return null // Silently ignore unauthorized groups
    }
    
    // Update last message timestamp for this group
    await updateGroupLastMessage(groupJid)
    logger.info('Message from authorized group', { groupJid, groupName, groupOwnerId })
  }

  // Handle image messages
  if (hasImage && imageBuffer) {
    try {
      const result = await handleImageMessage(from, imageBuffer, message, groupOwnerId)

      // Track successful processing
      trackEvent(
        WhatsAppAnalyticsEvent.WHATSAPP_MESSAGE_PROCESSED,
        distinctId,
        {
          [WhatsAppAnalyticsProperty.MESSAGE_TYPE]: 'image',
          [WhatsAppAnalyticsProperty.IS_GROUP_MESSAGE]: isGroup,
        }
      )

      return result
    } catch (error) {
      // Track failure
      trackEvent(
        WhatsAppAnalyticsEvent.WHATSAPP_MESSAGE_FAILED,
        distinctId,
        {
          [WhatsAppAnalyticsProperty.MESSAGE_TYPE]: 'image',
          [WhatsAppAnalyticsProperty.IS_GROUP_MESSAGE]: isGroup,
          [WhatsAppAnalyticsProperty.ERROR_MESSAGE]: error instanceof Error ? error.message : 'Unknown error',
        }
      )
      throw error
    }
  }

  // Handle text messages
  if (!message || message.trim() === '') {
    return null
  }

  try {
    const result = await handleTextMessage(from, message, quotedMessage, groupOwnerId, userIdentifiers)

    // Track successful processing
    trackEvent(
      WhatsAppAnalyticsEvent.WHATSAPP_MESSAGE_PROCESSED,
      distinctId,
      {
        [WhatsAppAnalyticsProperty.MESSAGE_TYPE]: 'text',
        [WhatsAppAnalyticsProperty.IS_GROUP_MESSAGE]: isGroup,
      }
    )

    return result
  } catch (error) {
    // Track failure
    trackEvent(
      WhatsAppAnalyticsEvent.WHATSAPP_MESSAGE_FAILED,
      distinctId,
      {
        [WhatsAppAnalyticsProperty.MESSAGE_TYPE]: 'text',
        [WhatsAppAnalyticsProperty.IS_GROUP_MESSAGE]: isGroup,
        [WhatsAppAnalyticsProperty.ERROR_MESSAGE]: error instanceof Error ? error.message : 'Unknown error',
      }
    )
    throw error
  }
}
