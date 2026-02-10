/**
 * NexFin Telegram Bot Entry Point
 * 
 * Runs the NexFin bot on Telegram for development and testing
 */

import * as dotenv from 'dotenv';
import http from 'http';
import { TelegramProvider } from './messaging/providers/telegram-provider.js';
import { handleUnifiedMessage } from './messaging/nexfin-adapter.js';
import { logger } from './services/monitoring/logger.js';
import { initializePostHog, shutdownPostHog } from './analytics/index.js';

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const PORT = parseInt(process.env.TELEGRAM_PORT || '3001');

if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN not set in environment');
  process.exit(1);
}

let telegramProvider: TelegramProvider | null = null;
let server: http.Server | null = null;

async function startTelegramBot() {
  console.log('\n🤖 ═══════════════════════════════════════════════');
  console.log('   NexFin Telegram Bot');
  console.log('═══════════════════════════════════════════════\n');

  // Initialize analytics
  initializePostHog();

  // Create Telegram provider
  telegramProvider = new TelegramProvider({
    botToken: TELEGRAM_BOT_TOKEN!,
    webhookUrl: TELEGRAM_WEBHOOK_URL,
    webhookSecret: TELEGRAM_WEBHOOK_SECRET
  });

  // Register message handler
  telegramProvider.onMessage(handleUnifiedMessage);

  // Connect to Telegram
  await telegramProvider.connect();
  
  // Set up webhook if configured
  if (TELEGRAM_WEBHOOK_URL) {
    await telegramProvider.setWebhook(TELEGRAM_WEBHOOK_URL, TELEGRAM_WEBHOOK_SECRET);
    
    // Create webhook server
    server = http.createServer(async (req, res) => {
      if (req.method === 'POST' && req.url === '/telegram/webhook') {
        // Verify secret token
        if (TELEGRAM_WEBHOOK_SECRET) {
          const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
          if (secretHeader !== TELEGRAM_WEBHOOK_SECRET) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
          }
        }

        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            const update = JSON.parse(body);
            await telegramProvider!.handleWebhookUpdate(update);
            res.writeHead(200);
            res.end('OK');
          } catch (error) {
            logger.error('Webhook error', { error });
            res.writeHead(500);
            res.end('Error');
          }
        });
      } else if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', platform: 'telegram' }));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    server.listen(PORT, () => {
      console.log(`📡 Webhook server listening on port ${PORT}`);
      console.log(`   Webhook URL: ${TELEGRAM_WEBHOOK_URL}`);
    });
  } else {
    console.log('📡 Running in long-polling mode');
  }

  console.log('\n✅ Telegram bot is ready!');
  console.log('   Bot: @NexFinAppBot');
  console.log('   Mode:', TELEGRAM_WEBHOOK_URL ? 'Webhook' : 'Long Polling');
  console.log('\n   Send /start to begin using NexFin!\n');
}

// Graceful shutdown
async function shutdown() {
  console.log('\n👋 Shutting down Telegram bot...');

  if (telegramProvider) {
    await telegramProvider.disconnect();
  }

  if (server) {
    server.close();
  }

  await shutdownPostHog();

  console.log('✅ Telegram bot stopped');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the bot
startTelegramBot().catch(error => {
  console.error('❌ Failed to start Telegram bot:', error);
  process.exit(1);
});
