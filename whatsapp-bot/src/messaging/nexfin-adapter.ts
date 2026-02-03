/**
 * NexFin Adapter
 * 
 * Bridges the unified messaging system to the existing NexFin handlers
 */

import { UnifiedMessage } from './types.js';
import { MessageContext } from '../types.js';
import { handleMessage } from '../handlers/core/message-handler.js';
import { logger } from '../services/monitoring/logger.js';

/**
 * Convert a UnifiedMessage to the existing MessageContext format
 */
export function toMessageContext(message: UnifiedMessage): MessageContext {
  return {
    from: message.from,
    isGroup: message.isGroup,
    groupJid: message.groupId,
    groupName: message.groupName,
    message: message.text || '',
    hasImage: message.hasImage,
    imageBuffer: message.imageBuffer,
    quotedMessage: undefined, // TODO: Handle quoted messages
    userIdentifiers: {
      jid: message.platform === 'whatsapp' ? `${message.from}@s.whatsapp.net` : undefined,
      phoneNumber: message.platform === 'whatsapp' ? message.from : undefined,
      telegramId: message.platform === 'telegram' ? message.from : undefined,
      platform: message.platform
    }
  };
}

/**
 * Handle a unified message using the existing NexFin handler
 */
export async function handleUnifiedMessage(message: UnifiedMessage): Promise<string | string[] | null> {
  try {
    logger.info('Processing unified message', {
      platform: message.platform,
      from: message.from,
      hasText: !!message.text,
      hasImage: message.hasImage,
      isGroup: message.isGroup
    });
    
    const context = toMessageContext(message);
    
    // Use the existing message handler
    const response = await handleMessage(context);
    
    return response;
  } catch (error) {
    logger.error('Error handling unified message', { error, messageId: message.id });
    throw error;
  }
}

/**
 * Create a message handler function for use with providers
 */
export function createMessageHandler() {
  return async (message: UnifiedMessage): Promise<string | string[] | null> => {
    return handleUnifiedMessage(message);
  };
}
