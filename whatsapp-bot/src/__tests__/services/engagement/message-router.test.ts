/**
 * Message Router Tests
 *
 * Story 4.6: Message Routing Service
 *
 * Tests:
 * - AC-4.6.1: When preferred_destination = 'individual', returns user's individual JID
 * - AC-4.6.2: When preferred_destination = 'group', returns stored group JID
 * - AC-4.6.6: getDestinationJid() returns correct JID based on preference
 * - AC-4.6.7: If group preference but no stored group JID, falls back to individual with warning
 * - AC-4.6.3, AC-4.6.4: Command pattern matching for destination switch
 * - AC-4.6.5: Localized confirmation messages
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  getMessageDestination,
  setPreferredDestination,
  autoDetectDestination,
  type RouteResult,
} from '../../../services/engagement/message-router'
import {
  isDestinationSwitchCommand,
  handleDestinationSwitch,
  type DestinationSwitchContext,
} from '../../../handlers/engagement/destination-handler'
import {
  mockSupabaseClient,
  resetSupabaseMocks,
  mockQuerySequence,
} from '../../../__mocks__/supabase'

// Mock the supabase client
jest.mock('../../../services/database/supabase-client', () => ({
  getSupabaseClient: () => mockSupabaseClient,
}))

// Mock the logger
jest.mock('../../../services/monitoring/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}))

// =============================================================================
// Helper Functions
// =============================================================================

const createMockUserProfile = (
  userId: string,
  destination: 'individual' | 'group',
  overrides: Partial<any> = {}
) => ({
  id: userId,
  user_id: userId,
  whatsapp_jid: '5511999999999@s.whatsapp.net',
  preferred_destination: destination,
  preferred_group_jid: destination === 'group' ? '123456789@g.us' : null,
  ...overrides,
})

// =============================================================================
// getMessageDestination() Tests
// =============================================================================

describe('Message Router - getMessageDestination()', () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe('Individual Destination (AC-4.6.1)', () => {
    it('should return individual JID when preferred_destination is individual', async () => {
      const userId = 'user-123'
      const mockProfile = createMockUserProfile(userId, 'individual')

      mockQuerySequence([
        // 1. Query user_profiles for preferred_destination
        { data: { preferred_destination: 'individual' }, error: null },
        // 2. Query authorized_whatsapp_numbers for whatsapp_jid
        { data: { whatsapp_jid: '5511999999999@s.whatsapp.net' }, error: null },
      ])

      const result = await getMessageDestination(userId)

      expect(result).not.toBeNull()
      expect(result!.destination).toBe('individual')
      expect(result!.destinationJid).toBe('5511999999999@s.whatsapp.net')
      expect(result!.fallbackUsed).toBe(false)
    })

    it('should default to individual when preferred_destination is null', async () => {
      const userId = 'user-123'
      const mockProfile = createMockUserProfile(userId, 'individual', {
        preferred_destination: null,
      })

      mockQuerySequence([
        // 1. Query user_profiles for preferred_destination (null = defaults to individual)
        { data: { preferred_destination: null }, error: null },
        // 2. Query authorized_whatsapp_numbers for whatsapp_jid
        { data: { whatsapp_jid: '5511999999999@s.whatsapp.net' }, error: null },
      ])

      const result = await getMessageDestination(userId)

      expect(result).not.toBeNull()
      expect(result!.destination).toBe('individual')
      expect(result!.destinationJid).toBe('5511999999999@s.whatsapp.net')
    })
  })

  describe('Group Destination (AC-4.6.2)', () => {
    it('should return group JID when preferred_destination is group and group_jid exists', async () => {
      const userId = 'user-123'
      const mockProfile = createMockUserProfile(userId, 'group', {
        preferred_group_jid: '120363456789@g.us',
      })

      mockQuerySequence([
        // 1. Query user_profiles for preferred_destination
        { data: { preferred_destination: 'group' }, error: null },
        // 2. Query authorized_whatsapp_numbers for whatsapp_jid (fallback)
        { data: { whatsapp_jid: '5511999999999@s.whatsapp.net' }, error: null },
        // 3. Query authorized_groups for group_jid
        { data: { group_jid: '120363456789@g.us' }, error: null },
      ])

      const result = await getMessageDestination(userId)

      expect(result).not.toBeNull()
      expect(result!.destination).toBe('group')
      expect(result!.destinationJid).toBe('120363456789@g.us')
      expect(result!.fallbackUsed).toBe(false)
    })
  })

  describe('Fallback Behavior (AC-4.6.7)', () => {
    it('should fallback to individual when group preference but no group_jid', async () => {
      const userId = 'user-123'
      const mockProfile = createMockUserProfile(userId, 'group', {
        preferred_group_jid: null,
      })

      mockQuerySequence([
        // 1. Query user_profiles for preferred_destination
        { data: { preferred_destination: 'group' }, error: null },
        // 2. Query authorized_whatsapp_numbers for whatsapp_jid (fallback)
        { data: { whatsapp_jid: '5511999999999@s.whatsapp.net' }, error: null },
        // 3. Query authorized_groups for group_jid (not found)
        { data: null, error: null },
      ])

      const result = await getMessageDestination(userId)

      expect(result).not.toBeNull()
      expect(result!.destination).toBe('individual') // Falls back
      expect(result!.destinationJid).toBe('5511999999999@s.whatsapp.net')
      expect(result!.fallbackUsed).toBe(true)
    })

    it('should return null when user profile not found', async () => {
      const userId = 'nonexistent-user'

      mockQuerySequence([
        { data: null, error: { code: 'PGRST116', message: 'No rows found' } },
      ])

      const result = await getMessageDestination(userId)

      expect(result).toBeNull()
    })

    it('should return null on database error', async () => {
      const userId = 'user-123'

      mockQuerySequence([
        { data: null, error: { code: 'CONNECTION_ERROR', message: 'Connection refused' } },
      ])

      const result = await getMessageDestination(userId)

      expect(result).toBeNull()
    })

    it('should return null when no JID is available', async () => {
      const userId = 'user-123'
      const mockProfile = createMockUserProfile(userId, 'individual', {
        whatsapp_jid: null,
        preferred_group_jid: null,
      })

      mockQuerySequence([
        // 1. Query user_profiles for preferred_destination
        { data: { preferred_destination: 'individual' }, error: null },
        // 2. Query authorized_whatsapp_numbers for whatsapp_jid (not found)
        { data: null, error: null },
      ])

      const result = await getMessageDestination(userId)

      expect(result).toBeNull()
    })
  })
})

// =============================================================================
// setPreferredDestination() Tests
// =============================================================================

describe('Message Router - setPreferredDestination()', () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it('should update preferred_destination to individual', async () => {
    const userId = 'user-123'
    const jid = '5511999999999@s.whatsapp.net'

    mockQuerySequence([
      { data: {}, error: null },
    ])

    const result = await setPreferredDestination(userId, 'individual', jid)

    expect(result).toBe(true)
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('user_profiles')
  })

  it('should update preferred_destination to group and store group_jid', async () => {
    const userId = 'user-123'
    const groupJid = '120363456789@g.us'

    mockQuerySequence([
      { data: {}, error: null },
    ])

    const result = await setPreferredDestination(userId, 'group', groupJid)

    expect(result).toBe(true)
  })

  it('should return false on database error', async () => {
    const userId = 'user-123'
    const jid = '5511999999999@s.whatsapp.net'

    mockQuerySequence([
      { data: null, error: { code: 'CONNECTION_ERROR', message: 'Connection refused' } },
    ])

    const result = await setPreferredDestination(userId, 'individual', jid)

    expect(result).toBe(false)
  })
})

// =============================================================================
// autoDetectDestination() Tests
// =============================================================================

describe('Message Router - autoDetectDestination()', () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it('should set destination on first message (no existing preference)', async () => {
    const userId = 'new-user-123'
    const jid = '5511999999999@s.whatsapp.net'

    mockQuerySequence([
      // Check existing preference
      { data: { preferred_destination: null }, error: null },
      // Set preference
      { data: {}, error: null },
    ])

    const result = await autoDetectDestination(userId, 'individual', jid)

    expect(result).toBe(true)
  })

  it('should not change destination if preference already set', async () => {
    const userId = 'existing-user-123'
    const jid = '120363456789@g.us'

    mockQuerySequence([
      // Check existing preference - already set to individual
      { data: { preferred_destination: 'individual' }, error: null },
    ])

    const result = await autoDetectDestination(userId, 'group', jid)

    expect(result).toBe(false)
  })

  it('should auto-detect group destination from group message', async () => {
    const userId = 'new-user-456'
    const groupJid = '120363456789@g.us'

    mockQuerySequence([
      // Check existing preference
      { data: { preferred_destination: null }, error: null },
      // Set preference
      { data: {}, error: null },
    ])

    const result = await autoDetectDestination(userId, 'group', groupJid)

    expect(result).toBe(true)
  })
})

// =============================================================================
// isDestinationSwitchCommand() Tests (AC-4.6.3, AC-4.6.4)
// =============================================================================

describe('Message Router - isDestinationSwitchCommand()', () => {
  describe('Switch to Group Patterns (AC-4.6.3)', () => {
    it.each([
      'mudar para grupo',
      'mudar para o grupo',
      'trocar para grupo',
      'trocar para o grupo',
      'mensagens no grupo',
      'mensagens em grupo',
      'switch to group',
      'messages in group',
      'group messages',
    ])('should recognize "%s" as group switch command', (message) => {
      expect(isDestinationSwitchCommand(message)).toBe('group')
    })

    it('should be case insensitive for PT-BR', () => {
      expect(isDestinationSwitchCommand('MUDAR PARA GRUPO')).toBe('group')
      expect(isDestinationSwitchCommand('Trocar Para Grupo')).toBe('group')
    })

    it('should be case insensitive for EN', () => {
      expect(isDestinationSwitchCommand('SWITCH TO GROUP')).toBe('group')
      expect(isDestinationSwitchCommand('Switch To Group')).toBe('group')
    })
  })

  describe('Switch to Individual Patterns (AC-4.6.4)', () => {
    it.each([
      'mudar para individual',
      'mudar para privado',
      'mudar para o privado',
      'trocar para privado',
      'trocar para individual',
      'mensagens privadas',
      'switch to individual',
      'switch to private',
      'private messages',
    ])('should recognize "%s" as individual switch command', (message) => {
      expect(isDestinationSwitchCommand(message)).toBe('individual')
    })

    it('should be case insensitive for PT-BR', () => {
      expect(isDestinationSwitchCommand('MUDAR PARA PRIVADO')).toBe('individual')
      expect(isDestinationSwitchCommand('Mensagens Privadas')).toBe('individual')
    })

    it('should be case insensitive for EN', () => {
      expect(isDestinationSwitchCommand('SWITCH TO PRIVATE')).toBe('individual')
      expect(isDestinationSwitchCommand('Private Messages')).toBe('individual')
    })
  })

  describe('Non-matching Messages', () => {
    it.each([
      'gastei 50 em comida',
      'adicionar despesa',
      'relatório',
      'hello',
      'mudar categoria',
      'grupo de amigos',
      'privado demais',
    ])('should return null for non-matching message "%s"', (message) => {
      expect(isDestinationSwitchCommand(message)).toBeNull()
    })
  })
})

// =============================================================================
// handleDestinationSwitch() Tests (AC-4.6.5)
// =============================================================================

describe('Message Router - handleDestinationSwitch()', () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe('Successful Switches', () => {
    it('should switch to group when groupJid is available in context', async () => {
      const userId = 'user-123'
      const context: DestinationSwitchContext = {
        userId,
        messageSource: 'group',
        groupJid: '120363456789@g.us',
        locale: 'pt-BR',
      }

      mockQuerySequence([
        // setPreferredDestination
        { data: {}, error: null },
      ])

      const result = await handleDestinationSwitch(userId, 'mudar para grupo', context)

      expect(result).not.toBeNull()
      expect(result!.success).toBe(true)
      expect(result!.newDestination).toBe('group')
      expect(result!.message).toBe('Pronto! Agora vou enviar mensagens no grupo.')
    })

    it('should switch to individual from any context', async () => {
      const userId = 'user-123'
      const context: DestinationSwitchContext = {
        userId,
        messageSource: 'individual',
        locale: 'en',
      }

      mockQuerySequence([
        // Get whatsapp_jid from profile
        { data: { whatsapp_jid: '5511999999999@s.whatsapp.net' }, error: null },
        // setPreferredDestination
        { data: {}, error: null },
      ])

      const result = await handleDestinationSwitch(userId, 'switch to private', context)

      expect(result).not.toBeNull()
      expect(result!.success).toBe(true)
      expect(result!.newDestination).toBe('individual')
      expect(result!.message).toBe("Done! I'll now send messages privately.")
    })
  })

  describe('Localized Messages (AC-4.6.5)', () => {
    it('should return PT-BR confirmation for group switch', async () => {
      const userId = 'user-123'
      const context: DestinationSwitchContext = {
        userId,
        messageSource: 'group',
        groupJid: '120363456789@g.us',
        locale: 'pt-BR',
      }

      mockQuerySequence([
        { data: {}, error: null },
      ])

      const result = await handleDestinationSwitch(userId, 'mudar para grupo', context)

      expect(result!.message).toBe('Pronto! Agora vou enviar mensagens no grupo.')
    })

    it('should return EN confirmation for group switch', async () => {
      const userId = 'user-123'
      const context: DestinationSwitchContext = {
        userId,
        messageSource: 'group',
        groupJid: '120363456789@g.us',
        locale: 'en',
      }

      mockQuerySequence([
        { data: {}, error: null },
      ])

      const result = await handleDestinationSwitch(userId, 'switch to group', context)

      expect(result!.message).toBe("Done! I'll now send messages in the group.")
    })

    it('should return PT-BR error message on failure', async () => {
      const userId = 'user-123'
      const context: DestinationSwitchContext = {
        userId,
        messageSource: 'individual',
        locale: 'pt-BR',
      }

      // No existing group JID
      mockQuerySequence([
        { data: { preferred_group_jid: null }, error: null },
      ])

      const result = await handleDestinationSwitch(userId, 'mudar para grupo', context)

      expect(result!.success).toBe(false)
      expect(result!.message).toBe('Para receber mensagens no grupo, envie uma mensagem no grupo primeiro.')
    })
  })

  describe('Edge Cases', () => {
    it('should return null for non-switch commands', async () => {
      const userId = 'user-123'
      const context: DestinationSwitchContext = {
        userId,
        messageSource: 'individual',
        locale: 'pt-BR',
      }

      const result = await handleDestinationSwitch(userId, 'gastei 50 em comida', context)

      expect(result).toBeNull()
    })

    it('should use existing group JID when switching from individual chat', async () => {
      const userId = 'user-123'
      const context: DestinationSwitchContext = {
        userId,
        messageSource: 'individual',
        locale: 'pt-BR',
      }

      mockQuerySequence([
        // Check for existing group JID
        { data: { preferred_group_jid: '120363456789@g.us' }, error: null },
        // setPreferredDestination
        { data: {}, error: null },
      ])

      const result = await handleDestinationSwitch(userId, 'mudar para grupo', context)

      expect(result!.success).toBe(true)
      expect(result!.newDestination).toBe('group')
    })

    it('should fail gracefully when no individual JID found', async () => {
      const userId = 'user-123'
      const context: DestinationSwitchContext = {
        userId,
        messageSource: 'group',
        groupJid: '120363456789@g.us',
        locale: 'pt-BR',
      }

      mockQuerySequence([
        // Get whatsapp_jid from profile - not found
        { data: { whatsapp_jid: null }, error: null },
      ])

      const result = await handleDestinationSwitch(userId, 'mudar para privado', context)

      expect(result!.success).toBe(false)
      expect(result!.message).toBe('Não consegui mudar a preferência. Tenta de novo?')
    })
  })
})
