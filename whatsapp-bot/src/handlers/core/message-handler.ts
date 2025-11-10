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

export async function handleMessage(context: MessageContext): Promise<string | string[] | null> {
  const { from, isGroup, groupJid, groupName, message, hasImage, imageBuffer, quotedMessage } = context

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
      logger.info('Ignoring message from unauthorized group', { groupJid, groupName })
      return null // Silently ignore unauthorized groups
    }
    
    // Update last message timestamp for this group
    await updateGroupLastMessage(groupJid)
    logger.info('Message from authorized group', { groupJid, groupName, groupOwnerId })
  }

  // Handle image messages
  if (hasImage && imageBuffer) {
    return await handleImageMessage(from, imageBuffer, message, groupOwnerId)
  }

  // Handle text messages
  if (!message || message.trim() === '') {
    return null
  }

  return await handleTextMessage(from, message, quotedMessage, groupOwnerId)
}
