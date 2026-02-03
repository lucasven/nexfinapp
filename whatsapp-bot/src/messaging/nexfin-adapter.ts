/**
 * NexFin Adapter
 *
 * Bridges the unified messaging system to the existing NexFin handlers
 */

import { UnifiedMessage } from './types.js';
import { MessageContext } from '../types.js';
import { handleMessage } from '../handlers/core/message-handler.js';
import { logger } from '../services/monitoring/logger.js';
import {
  UserIdentifiers,
  WhatsAppUserIdentifiers,
  createTelegramIdentifiers
} from '../utils/user-identifiers.js';

/**
 * Convert a UnifiedMessage to the existing MessageContext format
 */
export function toMessageContext(message: UnifiedMessage): MessageContext {
  let userIdentifiers: UserIdentifiers;

  if (message.platform === 'whatsapp') {
    userIdentifiers = {
      platform: 'whatsapp',
      jid: `${message.from}@s.whatsapp.net`,
      phoneNumber: message.from,
      lid: null,
      pushName: null,
      accountType: 'unknown',
      isGroup: message.isGroup,
      groupJid: message.groupId || null
    } satisfies WhatsAppUserIdentifiers;
  } else {
    userIdentifiers = createTelegramIdentifiers(
      message.from,
      message.chatId,
      message.isGroup,
      null, // pushName - could be extracted from raw if needed
      message.groupId || null
    );
  }

  return {
    from: message.from,
    isGroup: message.isGroup,
    groupJid: message.groupId,
    groupName: message.groupName,
    message: message.text || '',
    hasImage: message.hasImage,
    imageBuffer: message.imageBuffer,
    quotedMessage: undefined, // TODO: Handle quoted messages
    userIdentifiers
  };
}

/**
 * Handle a unified message using the existing NexFin handler
 */
export async function handleUnifiedMessage(message: UnifiedMessage): Promise<string | string[] | null> {
  logger.info('Processing unified message', {
    platform: message.platform,
    from: message.from,
    hasText: !!message.text,
    hasImage: message.hasImage,
    isGroup: message.isGroup
  });

  const context = toMessageContext(message);
  return handleMessage(context);
}
