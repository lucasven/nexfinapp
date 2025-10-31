// Mock all external dependencies
jest.mock('../services/supabase-client', () => require('../__mocks__/supabase'))
jest.mock('@whiskeysockets/baileys', () => require('../__mocks__/baileys'))
jest.mock('openai', () => require('../__mocks__/openai'))

// Mock environment variables
jest.mock('dotenv', () => ({
  config: jest.fn()
}))

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}
