/**
 * Messaging Abstraction Layer - Types
 * 
 * Unified types for multi-platform messaging (WhatsApp, Telegram, etc.)
 */

export type Platform = 'whatsapp' | 'telegram';

/**
 * Unified message representation across platforms
 */
export interface UnifiedMessage {
  id: string;
  platform: Platform;
  from: string;                    // User identifier (phone for WhatsApp, user_id for Telegram)
  chatId: string;                  // Chat/conversation identifier
  text?: string;
  hasImage: boolean;
  imageBuffer?: Buffer;
  timestamp: Date;
  isGroup: boolean;
  groupId?: string;
  groupName?: string;
  replyToMessageId?: string;       // For quoted/reply messages
  callbackData?: string;           // For button callbacks
  
  // Platform-specific raw data (for edge cases)
  raw?: unknown;
}

/**
 * Button for interactive messages
 */
export interface MessageButton {
  text: string;
  callbackData: string;
}

/**
 * Result of sending a message
 */
export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Media attachment
 */
export interface MediaAttachment {
  type: 'image' | 'document' | 'audio' | 'video';
  buffer?: Buffer;
  url?: string;
  mimeType?: string;
  filename?: string;
  caption?: string;
}

/**
 * Handler function type for incoming messages
 */
export type MessageHandler = (message: UnifiedMessage) => Promise<string | string[] | null>;

/**
 * Handler function type for button callbacks
 */
export type CallbackHandler = (callbackData: string, userId: string, chatId: string, messageId: string) => Promise<void>;

/**
 * Messaging provider interface
 */
export interface IMessagingProvider {
  readonly platform: Platform;
  
  // Connection lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  
  // Sending messages
  sendText(chatId: string, text: string, replyToMessageId?: string): Promise<SendResult>;
  sendButtons(chatId: string, text: string, buttons: MessageButton[]): Promise<SendResult>;
  sendMedia(chatId: string, media: MediaAttachment): Promise<SendResult>;
  
  // Event handlers
  onMessage(handler: MessageHandler): void;
  onCallback(handler: CallbackHandler): void;
  
  // Utility
  getUserDisplayName(userId: string): Promise<string | null>;
  getChatInfo(chatId: string): Promise<{ name?: string; isGroup: boolean } | null>;
}

/**
 * Configuration for messaging providers
 */
export interface MessagingConfig {
  whatsapp?: {
    authStatePath: string;
  };
  telegram?: {
    botToken: string;
    webhookUrl?: string;
    webhookSecret?: string;
  };
}
