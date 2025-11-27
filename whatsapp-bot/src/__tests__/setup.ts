// Load test environment variables FIRST
import dotenv from 'dotenv'
import { resolve } from 'path'

// Load .env.test file - use process.cwd() to avoid __dirname conflicts in Jest
dotenv.config({ path: resolve(process.cwd(), '.env.test') })

// Mock external dependencies inline to avoid circular dependencies

// Mock Baileys
jest.mock('@whiskeysockets/baileys', () => ({
  default: {},
  makeWASocket: jest.fn(),
  DisconnectReason: {},
  useMultiFileAuthState: jest.fn()
}))

// Mock OpenAI - FIXED: Properly handle both default and named exports
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

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}
