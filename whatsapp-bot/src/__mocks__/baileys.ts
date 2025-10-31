// Mock Baileys WhatsApp client
export const mockBaileysClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  sendMessage: jest.fn().mockResolvedValue({ key: { id: 'test-message-id' } }),
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

// Reset all mocks
export const resetBaileysMocks = () => {
  jest.clearAllMocks()
  mockBaileysClient.connect.mockResolvedValue(undefined)
  mockBaileysClient.disconnect.mockResolvedValue(undefined)
  mockBaileysClient.sendMessage.mockResolvedValue({ key: { id: 'test-message-id' } })
  mockBaileysClient.getState.mockReturnValue('open')
  mockBaileysClient.isConnected.mockReturnValue(true)
}
