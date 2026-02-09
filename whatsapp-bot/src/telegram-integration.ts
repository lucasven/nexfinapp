/**
 * Telegram Integration Module
 * 
 * Initializes the Telegram bot and provides a webhook handler
 * that can be mounted on the main HTTP server (shared port with WhatsApp).
 * 
 * Also supports long-polling mode when no webhook URL is configured.
 */

import http from 'http';
import { TelegramProvider } from './messaging/providers/telegram-provider.js';
import { handleUnifiedMessage } from './messaging/nexfin-adapter.js';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

let telegramProvider: TelegramProvider | null = null;

/**
 * Initialize the Telegram bot.
 * - If TELEGRAM_WEBHOOK_URL is set, configures webhook (handle requests via handleTelegramWebhook)
 * - If not, starts long-polling automatically
 * 
 * Call this after the HTTP server is listening.
 */
export async function initTelegram(): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('ℹ️  TELEGRAM_BOT_TOKEN not set — Telegram integration disabled');
    return;
  }

  console.log('\n🤖 Initializing Telegram bot...');

  telegramProvider = new TelegramProvider({
    botToken: TELEGRAM_BOT_TOKEN,
    webhookUrl: TELEGRAM_WEBHOOK_URL,
    webhookSecret: TELEGRAM_WEBHOOK_SECRET
  });

  telegramProvider.onMessage(handleUnifiedMessage);

  await telegramProvider.connect();

  if (TELEGRAM_WEBHOOK_URL) {
    await telegramProvider.setWebhook(TELEGRAM_WEBHOOK_URL, TELEGRAM_WEBHOOK_SECRET);
    console.log(`📡 Telegram webhook: ${TELEGRAM_WEBHOOK_URL}`);
  } else {
    console.log('📡 Telegram running in long-polling mode');
  }

  console.log('✅ Telegram bot ready!\n');
}

/**
 * Handle an incoming Telegram webhook request.
 * Mount this on POST /telegram/webhook in the main HTTP server.
 * 
 * @returns true if the request was handled, false if it's not a Telegram webhook request
 */
export function handleTelegramWebhook(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  if (req.method !== 'POST' || req.url !== '/telegram/webhook') {
    return false;
  }

  if (!telegramProvider) {
    res.writeHead(503);
    res.end('Telegram bot not initialized');
    return true;
  }

  // Verify secret token
  if (TELEGRAM_WEBHOOK_SECRET) {
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    if (secretHeader !== TELEGRAM_WEBHOOK_SECRET) {
      res.writeHead(403);
      res.end('Forbidden');
      return true;
    }
  }

  let body = '';
  req.on('data', (chunk: Buffer) => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const update = JSON.parse(body);
      await telegramProvider!.handleWebhookUpdate(update);
      res.writeHead(200);
      res.end('OK');
    } catch (error) {
      console.error('[Telegram] Webhook error:', error);
      res.writeHead(500);
      res.end('Error');
    }
  });

  return true;
}

/**
 * Gracefully disconnect the Telegram bot.
 */
export async function shutdownTelegram(): Promise<void> {
  if (telegramProvider) {
    await telegramProvider.disconnect();
    telegramProvider = null;
    console.log('👋 Telegram bot disconnected');
  }
}
