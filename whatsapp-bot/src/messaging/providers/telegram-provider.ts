/**
 * Telegram Provider
 * 
 * Implements IMessagingProvider for Telegram Bot API
 * Supports both webhook and long-polling modes
 */

import {
  IMessagingProvider,
  UnifiedMessage,
  MessageButton,
  SendResult,
  MediaAttachment,
  MessageHandler,
  CallbackHandler,
  Platform
} from '../types.js';
import { logger } from '../../services/monitoring/logger.js';

interface TelegramConfig {
  botToken: string;
  webhookUrl?: string;
  webhookSecret?: string;
  pollingInterval?: number;
}

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  photo?: Array<{ file_id: string; file_size?: number; width: number; height: number }>;
  document?: { file_id: string; file_name?: string; mime_type?: string };
  caption?: string;
  reply_to_message?: TelegramMessage;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export class TelegramProvider implements IMessagingProvider {
  readonly platform: Platform = 'telegram';
  
  private config: TelegramConfig;
  private baseUrl: string;
  private messageHandlers: MessageHandler[] = [];
  private callbackHandlers: CallbackHandler[] = [];
  private connected: boolean = false;
  private pollingAbortController: AbortController | null = null;
  private lastUpdateId: number = 0;
  
  constructor(config: TelegramConfig) {
    this.config = config;
    this.baseUrl = `https://api.telegram.org/bot${config.botToken}`;
  }
  
  async connect(): Promise<void> {
    try {
      // Verify bot token by calling getMe
      const response = await this.apiCall('getMe');
      if (!response.ok) {
        throw new Error(`Failed to verify bot token: ${response.description}`);
      }
      
      logger.info('Telegram bot connected', { 
        username: response.result.username,
        firstName: response.result.first_name 
      });
      
      this.connected = true;
      
      // Start polling if no webhook configured
      if (!this.config.webhookUrl) {
        this.startPolling();
      }
    } catch (error) {
      logger.error('Failed to connect Telegram bot', { error });
      throw error;
    }
  }
  
  async disconnect(): Promise<void> {
    if (this.pollingAbortController) {
      this.pollingAbortController.abort();
      this.pollingAbortController = null;
    }
    this.connected = false;
    logger.info('Telegram bot disconnected');
  }
  
  isConnected(): boolean {
    return this.connected;
  }
  
  async sendText(chatId: string, text: string, replyToMessageId?: string): Promise<SendResult> {
    try {
      const params: Record<string, unknown> = {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      };
      
      if (replyToMessageId) {
        params.reply_to_message_id = parseInt(replyToMessageId);
      }
      
      const response = await this.apiCall('sendMessage', params);
      
      if (response.ok) {
        return {
          success: true,
          messageId: response.result.message_id.toString()
        };
      } else {
        return {
          success: false,
          error: response.description
        };
      }
    } catch (error) {
      logger.error('Telegram sendText error', { error, chatId });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  async sendButtons(chatId: string, text: string, buttons: MessageButton[]): Promise<SendResult> {
    try {
      // Create inline keyboard
      const inlineKeyboard = buttons.map(button => [{
        text: button.text,
        callback_data: button.callbackData
      }]);
      
      const response = await this.apiCall('sendMessage', {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      });
      
      if (response.ok) {
        return {
          success: true,
          messageId: response.result.message_id.toString()
        };
      } else {
        return {
          success: false,
          error: response.description
        };
      }
    } catch (error) {
      logger.error('Telegram sendButtons error', { error, chatId });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  async sendMedia(chatId: string, media: MediaAttachment): Promise<SendResult> {
    try {
      let method: string;
      const params: Record<string, unknown> = {
        chat_id: chatId
      };
      
      if (media.caption) {
        params.caption = media.caption;
        params.parse_mode = 'HTML';
      }
      
      switch (media.type) {
        case 'image':
          method = 'sendPhoto';
          if (media.url) {
            params.photo = media.url;
          } else if (media.buffer) {
            // For buffer uploads, we'd need multipart form data
            // For now, just support URL
            return { success: false, error: 'Buffer upload not yet implemented' };
          }
          break;
        case 'document':
          method = 'sendDocument';
          if (media.url) {
            params.document = media.url;
          }
          break;
        default:
          return { success: false, error: `Unsupported media type: ${media.type}` };
      }
      
      const response = await this.apiCall(method, params);
      
      if (response.ok) {
        return {
          success: true,
          messageId: response.result.message_id.toString()
        };
      } else {
        return {
          success: false,
          error: response.description
        };
      }
    } catch (error) {
      logger.error('Telegram sendMedia error', { error, chatId });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }
  
  onCallback(handler: CallbackHandler): void {
    this.callbackHandlers.push(handler);
  }
  
  async getUserDisplayName(userId: string): Promise<string | null> {
    try {
      // Telegram doesn't have a direct API for this
      // We'd need to cache user info from messages
      return null;
    } catch {
      return null;
    }
  }
  
  async getChatInfo(chatId: string): Promise<{ name?: string; isGroup: boolean } | null> {
    try {
      const response = await this.apiCall('getChat', { chat_id: chatId });
      
      if (response.ok) {
        const chat = response.result;
        return {
          name: chat.title || chat.first_name,
          isGroup: chat.type !== 'private'
        };
      }
      return null;
    } catch {
      return null;
    }
  }
  
  /**
   * Handle incoming webhook updates
   * Call this from your Express/webhook endpoint
   */
  async handleWebhookUpdate(update: TelegramUpdate): Promise<void> {
    await this.processUpdate(update);
  }
  
  /**
   * Set up webhook for receiving updates
   */
  async setWebhook(url: string, secretToken?: string): Promise<boolean> {
    try {
      const params: Record<string, unknown> = { url };
      
      if (secretToken) {
        params.secret_token = secretToken;
      }
      
      const response = await this.apiCall('setWebhook', params);
      
      if (response.ok) {
        logger.info('Telegram webhook set', { url });
        return true;
      } else {
        logger.error('Failed to set Telegram webhook', { error: response.description });
        return false;
      }
    } catch (error) {
      logger.error('Error setting Telegram webhook', { error });
      return false;
    }
  }
  
  /**
   * Delete webhook (switch to polling)
   */
  async deleteWebhook(): Promise<boolean> {
    try {
      const response = await this.apiCall('deleteWebhook');
      return response.ok;
    } catch {
      return false;
    }
  }
  
  // Private methods
  
  private async apiCall(method: string, params?: Record<string, unknown>): Promise<any> {
    const url = `${this.baseUrl}/${method}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: params ? JSON.stringify(params) : undefined
    });
    
    return response.json();
  }
  
  private async startPolling(): Promise<void> {
    logger.info('Starting Telegram long polling');
    
    this.pollingAbortController = new AbortController();
    
    while (this.connected && !this.pollingAbortController.signal.aborted) {
      try {
        const response = await this.apiCall('getUpdates', {
          offset: this.lastUpdateId + 1,
          timeout: 30,
          allowed_updates: ['message', 'callback_query']
        });
        
        if (response.ok && response.result.length > 0) {
          for (const update of response.result) {
            this.lastUpdateId = update.update_id;
            await this.processUpdate(update);
          }
        }
      } catch (error) {
        if (this.connected) {
          logger.error('Telegram polling error', { error });
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }
    
    logger.info('Telegram polling stopped');
  }
  
  private async processUpdate(update: TelegramUpdate): Promise<void> {
    try {
      if (update.message) {
        await this.handleTelegramMessage(update.message);
      } else if (update.callback_query) {
        await this.handleCallbackQuery(update.callback_query);
      }
    } catch (error) {
      logger.error('Error processing Telegram update', { error, updateId: update.update_id });
    }
  }
  
  private async handleTelegramMessage(msg: TelegramMessage): Promise<void> {
    // Convert to unified message
    const unifiedMessage: UnifiedMessage = {
      id: msg.message_id.toString(),
      platform: 'telegram',
      from: msg.from?.id.toString() || 'unknown',
      chatId: msg.chat.id.toString(),
      text: msg.text || msg.caption,
      hasImage: !!msg.photo && msg.photo.length > 0,
      timestamp: new Date(msg.date * 1000),
      isGroup: msg.chat.type !== 'private',
      groupId: msg.chat.type !== 'private' ? msg.chat.id.toString() : undefined,
      groupName: msg.chat.title,
      replyToMessageId: msg.reply_to_message?.message_id.toString(),
      raw: msg
    };
    
    // Download image if present
    if (unifiedMessage.hasImage && msg.photo) {
      try {
        // Get the largest photo
        const photo = msg.photo[msg.photo.length - 1];
        const fileResponse = await this.apiCall('getFile', { file_id: photo.file_id });
        
        if (fileResponse.ok) {
          const fileUrl = `https://api.telegram.org/file/bot${this.config.botToken}/${fileResponse.result.file_path}`;
          const imageResponse = await fetch(fileUrl);
          unifiedMessage.imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        }
      } catch (error) {
        logger.error('Error downloading Telegram image', { error });
      }
    }
    
    // Call all message handlers
    for (const handler of this.messageHandlers) {
      try {
        const response = await handler(unifiedMessage);
        
        // Send response if any
        if (response) {
          const responses = Array.isArray(response) ? response : [response];
          for (const text of responses) {
            if (text && text.trim()) {
              await this.sendText(unifiedMessage.chatId, text);
            }
          }
        }
      } catch (error) {
        logger.error('Error in message handler', { error });
      }
    }
  }
  
  private async handleCallbackQuery(query: TelegramCallbackQuery): Promise<void> {
    // Answer the callback query to remove loading state
    await this.apiCall('answerCallbackQuery', { callback_query_id: query.id });
    
    if (!query.data || !query.message) return;
    
    // Call all callback handlers
    for (const handler of this.callbackHandlers) {
      try {
        await handler(
          query.data,
          query.from.id.toString(),
          query.message.chat.id.toString(),
          query.message.message_id.toString()
        );
      } catch (error) {
        logger.error('Error in callback handler', { error });
      }
    }
  }
}
