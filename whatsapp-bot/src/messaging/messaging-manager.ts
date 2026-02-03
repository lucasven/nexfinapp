/**
 * Messaging Manager
 * 
 * Manages multiple messaging providers and routes messages to the core handler
 */

import {
  IMessagingProvider,
  UnifiedMessage,
  MessageButton,
  SendResult,
  Platform
} from './types.js';
import { TelegramProvider } from './providers/telegram-provider.js';
import { logger } from '../services/monitoring/logger.js';

class MessagingManager {
  private providers: Map<Platform, IMessagingProvider> = new Map();
  
  /**
   * Register a messaging provider
   */
  registerProvider(provider: IMessagingProvider): void {
    this.providers.set(provider.platform, provider);
    logger.info(`Registered messaging provider: ${provider.platform}`);
  }
  
  /**
   * Get a specific provider
   */
  getProvider(platform: Platform): IMessagingProvider | undefined {
    return this.providers.get(platform);
  }
  
  /**
   * Get all registered providers
   */
  getAllProviders(): IMessagingProvider[] {
    return Array.from(this.providers.values());
  }
  
  /**
   * Connect all providers
   */
  async connectAll(): Promise<void> {
    const results = await Promise.allSettled(
      Array.from(this.providers.values()).map(p => p.connect())
    );
    
    results.forEach((result, index) => {
      const platform = Array.from(this.providers.keys())[index];
      if (result.status === 'rejected') {
        logger.error(`Failed to connect ${platform}`, { error: result.reason });
      }
    });
  }
  
  /**
   * Disconnect all providers
   */
  async disconnectAll(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.providers.values()).map(p => p.disconnect())
    );
  }
  
  /**
   * Send a message through the appropriate provider
   */
  async sendText(platform: Platform, chatId: string, text: string): Promise<SendResult> {
    const provider = this.providers.get(platform);
    if (!provider) {
      return { success: false, error: `Provider not found: ${platform}` };
    }
    return provider.sendText(chatId, text);
  }
  
  /**
   * Send buttons through the appropriate provider
   */
  async sendButtons(platform: Platform, chatId: string, text: string, buttons: MessageButton[]): Promise<SendResult> {
    const provider = this.providers.get(platform);
    if (!provider) {
      return { success: false, error: `Provider not found: ${platform}` };
    }
    return provider.sendButtons(chatId, text, buttons);
  }
  
  /**
   * Reply to a message (uses the same platform as the original message)
   */
  async reply(originalMessage: UnifiedMessage, text: string): Promise<SendResult> {
    const provider = this.providers.get(originalMessage.platform);
    if (!provider) {
      return { success: false, error: `Provider not found: ${originalMessage.platform}` };
    }
    return provider.sendText(originalMessage.chatId, text, originalMessage.id);
  }
}

// Singleton instance
export const messagingManager = new MessagingManager();

/**
 * Initialize Telegram provider with configuration
 */
export function initializeTelegram(botToken: string, webhookUrl?: string): TelegramProvider {
  const provider = new TelegramProvider({
    botToken,
    webhookUrl
  });

  messagingManager.registerProvider(provider);
  return provider;
}
