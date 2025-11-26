// Array to capture sent messages for test assertions
let mockMessages: Array<{ jid: string; message: any }> = []

// Mock Baileys WhatsApp client
export const mockBaileysClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  sendMessage: jest.fn().mockImplementation(async (jid: string, message: any) => {
    mockMessages.push({ jid, message })
    return { key: { id: `test-message-${mockMessages.length}` } }
  }),
  getState: jest.fn().mockReturnValue('open'),
  isConnected: jest.fn().mockReturnValue(true),
  ev: {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn()
  }
}

// Mock makeWASocket function
export const makeWASocket = jest.fn(() => mockBaileysClient)

// Mock Baileys utilities
export const DisconnectReason = {
  badSession: 'bad_session',
  connectionClosed: 'connection_closed',
  connectionLost: 'connection_lost',
  connectionReplaced: 'connection_replaced',
  loggedOut: 'logged_out',
  restartRequired: 'restart_required',
  timedOut: 'timed_out'
}

export const ConnectionState = {
  close: 'close',
  connecting: 'connecting',
  open: 'open'
}

// Mock QR code generation
export const generateWAMessageFromContent = jest.fn()
export const prepareWAMessageMedia = jest.fn()

/**
 * Get all messages sent via mockBaileysClient.sendMessage
 * Useful for test assertions to verify messages were sent correctly
 *
 * @example
 * ```typescript
 * import { getMockMessages, clearMockMessages } from '@/__mocks__/baileys'
 *
 * beforeEach(() => {
 *   clearMockMessages()
 * })
 *
 * it('sends goodbye message', async () => {
 *   await sendGoodbyeMessage(userId)
 *   const messages = getMockMessages()
 *   expect(messages).toHaveLength(1)
 *   expect(messages[0].jid).toBe(userJid)
 * })
 * ```
 */
export const getMockMessages = () => {
  return [...mockMessages]
}

/**
 * Clear all captured messages
 * Should be called in beforeEach() to reset state between tests
 *
 * @example
 * ```typescript
 * beforeEach(() => {
 *   clearMockMessages()
 * })
 * ```
 */
export const clearMockMessages = () => {
  mockMessages = []
}

// Reset all mocks
export const resetBaileysMocks = () => {
  jest.clearAllMocks()
  clearMockMessages()
  mockBaileysClient.connect.mockResolvedValue(undefined)
  mockBaileysClient.disconnect.mockResolvedValue(undefined)
  mockBaileysClient.sendMessage.mockImplementation(async (jid: string, message: any) => {
    mockMessages.push({ jid, message })
    return { key: { id: `test-message-${mockMessages.length}` } }
  })
  mockBaileysClient.getState.mockReturnValue('open')
  mockBaileysClient.isConnected.mockReturnValue(true)
}
