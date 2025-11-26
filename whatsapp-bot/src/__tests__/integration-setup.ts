// Integration test setup - Use real test database instead of mocks
import dotenv from 'dotenv'
import { resolve } from 'path'

// Load test environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.test') })

// Mock Baileys
jest.mock('@whiskeysockets/baileys', () => ({
  default: {},
  makeWASocket: jest.fn(),
  DisconnectReason: {},
  useMultiFileAuthState: jest.fn()
}))

// Mock OpenAI
jest.mock('openai', () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: 'Mocked AI response'
            }
          }]
        })
      }
    }

    embeddings = {
      create: jest.fn().mockResolvedValue({
        data: [{
          embedding: new Array(1536).fill(0.1)
        }]
      })
    }
  }

  return {
    __esModule: true,
    default: MockOpenAI,
    OpenAI: MockOpenAI
  }
})

// CRITICAL: Mock database client to use test database
// This must be set up before any imports that use getSupabaseClient()
jest.mock('../services/database/supabase-client.js', () => {
  // Dynamically import to avoid circular dependencies
  let testClient: any = null

  function getTestClient() {
    if (!testClient) {
      const { getTestSupabaseClient } = require('./utils/test-database.js')
      testClient = getTestSupabaseClient()
    }
    return testClient
  }

  return {
    getSupabaseClient: jest.fn(() => getTestClient()),
  }
})

// Mock WhatsApp socket to prevent actual message sending
jest.mock('../index.js', () => ({
  getSocket: jest.fn(() => ({
    user: { id: 'test-bot@s.whatsapp.net' },
    sendMessage: jest.fn().mockResolvedValue(undefined),
  })),
}))

// Mock message-router to return consistent test destinations
jest.mock('../services/engagement/message-router.js', () => ({
  getMessageDestination: jest.fn().mockResolvedValue({
    destination: 'individual',
    destinationJid: 'test@s.whatsapp.net',
    fallbackUsed: false,
  }),
}))

// Mock analytics tracker to prevent external API calls
jest.mock('../analytics/tracker.js', () => ({
  trackEvent: jest.fn(),
}))

// Mock logger to reduce noise
jest.mock('../services/monitoring/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

// Mock console methods to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})
