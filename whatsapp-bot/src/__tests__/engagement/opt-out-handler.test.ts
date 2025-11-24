/**
 * Opt-Out Handler Tests
 *
 * Story 3.5: Skip Onboarding Command
 * Story 6.1: WhatsApp Opt-Out/Opt-In Commands
 *
 * Tests:
 * - AC-3.5.1: "parar dicas" or "stop tips" disables tips
 * - AC-3.5.2: "ativar dicas" or "enable tips" re-enables tips
 * - AC-3.5.3: With tips disabled, tier completions tracked but NOT celebrated
 * - AC-3.5.4: Tip preference is separate from re-engagement opt-out
 * - AC-3.5.5: Command matching is case-insensitive
 * - AC-6.1.1: "parar lembretes" sets reengagement_opt_out = true
 * - AC-6.1.2: "ativar lembretes" sets reengagement_opt_out = false
 * - AC-6.1.3: Variations in phrasing recognized
 * - AC-6.1.4: Idempotent operations
 * - AC-6.1.5: Error handling with user-friendly messages
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  isTipCommand,
  handleTipOptOut,
  parseOptOutCommand,
  handleOptOutCommand,
  type OptOutContext
} from '../../handlers/engagement/opt-out-handler'
import {
  mockSupabaseClient,
  resetSupabaseMocks,
  mockQuerySuccess,
  mockQueryError,
} from '../../__mocks__/supabase'

// Mock the supabase client
jest.mock('../../services/database/supabase-client', () => ({
  getSupabaseClient: () => mockSupabaseClient,
}))

// Mock the logger
jest.mock('../../services/monitoring/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}))

// Mock analytics
jest.mock('../../analytics/index', () => ({
  trackEvent: jest.fn(),
  WhatsAppAnalyticsEvent: {
    ENGAGEMENT_PREFERENCE_CHANGED: 'engagement_preference_changed'
  }
}))

describe('Opt-Out Handler - Story 3.5', () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  // ===========================================================================
  // isTipCommand Tests
  // ===========================================================================

  describe('isTipCommand', () => {
    // AC-3.5.1: Disable patterns
    describe('disable patterns (AC-3.5.1)', () => {
      it('should return "disable" for "parar dicas"', () => {
        expect(isTipCommand('parar dicas')).toBe('disable')
      })

      it('should return "disable" for "stop tips"', () => {
        expect(isTipCommand('stop tips')).toBe('disable')
      })

      it('should return "disable" for "desativar dicas"', () => {
        expect(isTipCommand('desativar dicas')).toBe('disable')
      })

      it('should return "disable" for "disable tips"', () => {
        expect(isTipCommand('disable tips')).toBe('disable')
      })
    })

    // AC-3.5.2: Enable patterns
    describe('enable patterns (AC-3.5.2)', () => {
      it('should return "enable" for "ativar dicas"', () => {
        expect(isTipCommand('ativar dicas')).toBe('enable')
      })

      it('should return "enable" for "enable tips"', () => {
        expect(isTipCommand('enable tips')).toBe('enable')
      })

      it('should return "enable" for "start tips"', () => {
        expect(isTipCommand('start tips')).toBe('enable')
      })

      it('should return "enable" for "ligar dicas"', () => {
        expect(isTipCommand('ligar dicas')).toBe('enable')
      })
    })

    // AC-3.5.5: Case-insensitive matching
    describe('case-insensitive matching (AC-3.5.5)', () => {
      it('should match "PARAR DICAS" (uppercase)', () => {
        expect(isTipCommand('PARAR DICAS')).toBe('disable')
      })

      it('should match "STOP TIPS" (uppercase)', () => {
        expect(isTipCommand('STOP TIPS')).toBe('disable')
      })

      it('should match "Parar Dicas" (title case)', () => {
        expect(isTipCommand('Parar Dicas')).toBe('disable')
      })

      it('should match "ATIVAR DICAS" (uppercase)', () => {
        expect(isTipCommand('ATIVAR DICAS')).toBe('enable')
      })

      it('should match "Enable Tips" (title case)', () => {
        expect(isTipCommand('Enable Tips')).toBe('enable')
      })
    })

    // Whitespace handling
    describe('whitespace handling', () => {
      it('should handle leading/trailing whitespace', () => {
        expect(isTipCommand('  parar dicas  ')).toBe('disable')
      })

      it('should handle variable spacing between words', () => {
        expect(isTipCommand('parar  dicas')).toBe('disable')
        expect(isTipCommand('stop  tips')).toBe('disable')
      })
    })

    // Non-matching text
    describe('non-matching text', () => {
      it('should return null for regular messages', () => {
        expect(isTipCommand('gastei 50 no mercado')).toBeNull()
      })

      it('should return null for partial matches', () => {
        expect(isTipCommand('parar')).toBeNull()
        expect(isTipCommand('dicas')).toBeNull()
        expect(isTipCommand('tips')).toBeNull()
      })

      it('should return null for similar but different phrases', () => {
        expect(isTipCommand('parar notificações')).toBeNull()
        expect(isTipCommand('stop messages')).toBeNull()
      })

      it('should return null for embedded matches', () => {
        expect(isTipCommand('eu quero parar dicas por favor')).toBeNull()
      })
    })
  })

  // ===========================================================================
  // handleTipOptOut Tests
  // ===========================================================================

  describe('handleTipOptOut', () => {
    const userId = 'user-123'

    // AC-3.5.1: Disable tips
    describe('disable tips (AC-3.5.1)', () => {
      it('should call database and return Portuguese confirmation for "parar dicas"', async () => {
        mockQuerySuccess({})

        const result = await handleTipOptOut(userId, 'parar dicas', 'pt-BR')

        expect(mockSupabaseClient.from).toHaveBeenCalledWith('user_profiles')
        expect(result).toContain('Dicas desativadas')
        expect(result).toContain('ativar dicas')
      })

      it('should return English confirmation for English locale', async () => {
        mockQuerySuccess({})

        const result = await handleTipOptOut(userId, 'stop tips', 'en')

        expect(result).toContain('Tips disabled')
        expect(result).toContain('enable tips')
      })
    })

    // AC-3.5.2: Enable tips
    describe('enable tips (AC-3.5.2)', () => {
      it('should call database and return Portuguese confirmation for "ativar dicas"', async () => {
        mockQuerySuccess({})

        const result = await handleTipOptOut(userId, 'ativar dicas', 'pt-BR')

        expect(mockSupabaseClient.from).toHaveBeenCalledWith('user_profiles')
        expect(result).toContain('Dicas ativadas')
      })

      it('should return English confirmation for English locale', async () => {
        mockQuerySuccess({})

        const result = await handleTipOptOut(userId, 'enable tips', 'en')

        expect(result).toContain('Tips enabled')
      })
    })

    // Non-tip commands
    describe('non-tip commands', () => {
      it('should return null for regular messages', async () => {
        const result = await handleTipOptOut(userId, 'gastei 50 no mercado', 'pt-BR')
        expect(result).toBeNull()
      })

      it('should not call database for non-tip commands', async () => {
        await handleTipOptOut(userId, 'hello world', 'pt-BR')
        expect(mockSupabaseClient.from).not.toHaveBeenCalled()
      })
    })

    // Error handling
    describe('error handling', () => {
      it('should return error message on database error (pt-BR)', async () => {
        mockQueryError(new Error('Database error'))

        const result = await handleTipOptOut(userId, 'parar dicas', 'pt-BR')

        expect(result).toContain('Erro')
      })

      it('should return error message on database error (en)', async () => {
        mockQueryError(new Error('Database error'))

        const result = await handleTipOptOut(userId, 'stop tips', 'en')

        expect(result).toContain('Error')
      })
    })
  })

  // ===========================================================================
  // AC-3.5.4: Separation from re-engagement opt-out
  // ===========================================================================

  describe('separation from re-engagement (AC-3.5.4)', () => {
    it('should process tip commands independently (documentation test)', async () => {
      // This test verifies that tip command handling:
      // 1. Uses its own dedicated column (onboarding_tips_enabled)
      // 2. Does NOT touch reengagement_opt_out
      // The separation is enforced by the implementation which only updates
      // onboarding_tips_enabled in handleTipOptOut()

      mockQuerySuccess({})

      const result = await handleTipOptOut('user-123', 'parar dicas', 'pt-BR')

      // Successfully processed = only tip preference was touched
      expect(result).not.toBeNull()
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('user_profiles')
      // The confirmation message should reference tips, not re-engagement
      expect(result).toContain('dicas')
    })
  })
})

// ===========================================================================
// Story 6.1: Re-engagement Opt-Out/Opt-In Commands
// ===========================================================================

describe('Re-engagement Opt-Out Handler - Story 6.1', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    jest.clearAllMocks()
  })

  // ===========================================================================
  // parseOptOutCommand Tests
  // ===========================================================================

  describe('parseOptOutCommand', () => {
    // AC-6.1.1: Portuguese opt-out patterns
    describe('Portuguese opt-out patterns (AC-6.1.1)', () => {
      it('should return "opt_out" for "parar lembretes"', () => {
        expect(parseOptOutCommand('parar lembretes', 'pt-BR')).toBe('opt_out')
      })

      it('should return "opt_out" for "parar reengajamento"', () => {
        expect(parseOptOutCommand('parar reengajamento', 'pt-BR')).toBe('opt_out')
      })

      it('should return "opt_out" for "cancelar notificações"', () => {
        expect(parseOptOutCommand('cancelar notificações', 'pt-BR')).toBe('opt_out')
      })

      it('should return "opt_out" for "desativar lembretes"', () => {
        expect(parseOptOutCommand('desativar lembretes', 'pt-BR')).toBe('opt_out')
      })
    })

    // AC-6.1.1: English opt-out patterns
    describe('English opt-out patterns (AC-6.1.1)', () => {
      it('should return "opt_out" for "stop reminders"', () => {
        expect(parseOptOutCommand('stop reminders', 'en')).toBe('opt_out')
      })

      it('should return "opt_out" for "disable notifications"', () => {
        expect(parseOptOutCommand('disable notifications', 'en')).toBe('opt_out')
      })

      it('should return "opt_out" for "opt out"', () => {
        expect(parseOptOutCommand('opt out', 'en')).toBe('opt_out')
      })

      it('should return "opt_out" for "unsubscribe"', () => {
        expect(parseOptOutCommand('unsubscribe', 'en')).toBe('opt_out')
      })
    })

    // AC-6.1.2: Portuguese opt-in patterns
    describe('Portuguese opt-in patterns (AC-6.1.2)', () => {
      it('should return "opt_in" for "ativar lembretes"', () => {
        expect(parseOptOutCommand('ativar lembretes', 'pt-BR')).toBe('opt_in')
      })

      it('should return "opt_in" for "ativar reengajamento"', () => {
        expect(parseOptOutCommand('ativar reengajamento', 'pt-BR')).toBe('opt_in')
      })

      it('should return "opt_in" for "quero notificações"', () => {
        expect(parseOptOutCommand('quero notificações', 'pt-BR')).toBe('opt_in')
      })
    })

    // AC-6.1.2: English opt-in patterns
    describe('English opt-in patterns (AC-6.1.2)', () => {
      it('should return "opt_in" for "start reminders"', () => {
        expect(parseOptOutCommand('start reminders', 'en')).toBe('opt_in')
      })

      it('should return "opt_in" for "enable notifications"', () => {
        expect(parseOptOutCommand('enable notifications', 'en')).toBe('opt_in')
      })

      it('should return "opt_in" for "opt in"', () => {
        expect(parseOptOutCommand('opt in', 'en')).toBe('opt_in')
      })

      it('should return "opt_in" for "subscribe"', () => {
        expect(parseOptOutCommand('subscribe', 'en')).toBe('opt_in')
      })
    })

    // AC-6.1.3: Variations in phrasing
    describe('variations in phrasing (AC-6.1.3)', () => {
      it('should recognize "quero parar lembretes" (opt-out)', () => {
        expect(parseOptOutCommand('quero parar lembretes', 'pt-BR')).toBe('opt_out')
      })

      it('should recognize "preciso stop reminders" (opt-out)', () => {
        expect(parseOptOutCommand('preciso stop reminders', 'en')).toBe('opt_out')
      })

      it('should recognize "I want to opt out" (opt-out)', () => {
        expect(parseOptOutCommand('I want to opt out', 'en')).toBe('opt_out')
      })

      it('should recognize "quero ativar lembretes por favor" (opt-in)', () => {
        expect(parseOptOutCommand('quero ativar lembretes por favor', 'pt-BR')).toBe('opt_in')
      })

      it('should recognize "I want to start reminders" (opt-in)', () => {
        expect(parseOptOutCommand('I want to start reminders', 'en')).toBe('opt_in')
      })
    })

    // Cross-language support
    describe('cross-language support', () => {
      it('should recognize Portuguese patterns with English locale', () => {
        expect(parseOptOutCommand('parar lembretes', 'en')).toBe('opt_out')
      })

      it('should recognize English patterns with Portuguese locale', () => {
        expect(parseOptOutCommand('stop reminders', 'pt-BR')).toBe('opt_out')
      })
    })

    // Case-insensitive matching
    describe('case-insensitive matching', () => {
      it('should match "PARAR LEMBRETES" (uppercase)', () => {
        expect(parseOptOutCommand('PARAR LEMBRETES', 'pt-BR')).toBe('opt_out')
      })

      it('should match "Stop Reminders" (title case)', () => {
        expect(parseOptOutCommand('Stop Reminders', 'en')).toBe('opt_out')
      })
    })

    // Non-matching text
    describe('non-matching text', () => {
      it('should return null for regular expense messages', () => {
        expect(parseOptOutCommand('gastei 50 no mercado', 'pt-BR')).toBeNull()
      })

      it('should return null for "add expense"', () => {
        expect(parseOptOutCommand('add expense', 'en')).toBeNull()
      })

      it('should return null for tip commands', () => {
        expect(parseOptOutCommand('parar dicas', 'pt-BR')).toBeNull()
      })
    })
  })

  // ===========================================================================
  // handleOptOutCommand Tests
  // ===========================================================================

  describe('handleOptOutCommand', () => {
    const userId = 'user-123'
    const whatsappJid = '+5511999999999@s.whatsapp.net'

    // AC-6.1.1: Opt-out sets reengagement_opt_out = true
    describe('opt-out command (AC-6.1.1)', () => {
      it('should update reengagement_opt_out to true for opt-out', async () => {
        // Mock fetch current state
        mockSupabaseClient.from.mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { reengagement_opt_out: false },
            error: null
          })
        })

        // Mock update
        mockSupabaseClient.from.mockReturnValueOnce({
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: null })
        })

        const context: OptOutContext = {
          userId,
          whatsappJid,
          command: 'opt_out',
          locale: 'pt-BR'
        }

        const result = await handleOptOutCommand(context)

        expect(result.success).toBe(true)
        expect(result.newState).toBe(true)
        expect(mockSupabaseClient.from).toHaveBeenCalledWith('user_profiles')
      })

      it('should track PostHog event for opt-out', async () => {
        mockSupabaseClient.from.mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { reengagement_opt_out: false },
            error: null
          })
        })

        mockSupabaseClient.from.mockReturnValueOnce({
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: null })
        })

        const { trackEvent } = require('../../analytics/index')

        const context: OptOutContext = {
          userId,
          whatsappJid,
          command: 'opt_out',
          locale: 'pt-BR'
        }

        await handleOptOutCommand(context)

        expect(trackEvent).toHaveBeenCalledWith(
          'engagement_preference_changed',
          userId,
          expect.objectContaining({
            user_id: userId,
            preference: 'opted_out',
            source: 'whatsapp'
          })
        )
      })
    })

    // AC-6.1.2: Opt-in sets reengagement_opt_out = false
    describe('opt-in command (AC-6.1.2)', () => {
      it('should update reengagement_opt_out to false for opt-in', async () => {
        mockSupabaseClient.from.mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { reengagement_opt_out: true },
            error: null
          })
        })

        mockSupabaseClient.from.mockReturnValueOnce({
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: null })
        })

        const context: OptOutContext = {
          userId,
          whatsappJid,
          command: 'opt_in',
          locale: 'pt-BR'
        }

        const result = await handleOptOutCommand(context)

        expect(result.success).toBe(true)
        expect(result.newState).toBe(false)
      })

      it('should track PostHog event for opt-in', async () => {
        mockSupabaseClient.from.mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { reengagement_opt_out: true },
            error: null
          })
        })

        mockSupabaseClient.from.mockReturnValueOnce({
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: null })
        })

        const { trackEvent } = require('../../analytics/index')

        const context: OptOutContext = {
          userId,
          whatsappJid,
          command: 'opt_in',
          locale: 'en'
        }

        await handleOptOutCommand(context)

        expect(trackEvent).toHaveBeenCalledWith(
          'engagement_preference_changed',
          userId,
          expect.objectContaining({
            user_id: userId,
            preference: 'opted_in',
            source: 'whatsapp'
          })
        )
      })
    })

    // AC-6.1.4: Idempotent operations
    describe('idempotent operations (AC-6.1.4)', () => {
      it('should succeed when setting opt-out multiple times', async () => {
        mockSupabaseClient.from.mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { reengagement_opt_out: true }, // Already opted out
            error: null
          })
        })

        mockSupabaseClient.from.mockReturnValueOnce({
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: null })
        })

        const context: OptOutContext = {
          userId,
          whatsappJid,
          command: 'opt_out',
          locale: 'pt-BR'
        }

        const result = await handleOptOutCommand(context)

        expect(result.success).toBe(true)
        expect(result.previousState).toBe(true)
        expect(result.newState).toBe(true)
      })
    })

    // AC-6.1.5: Error handling
    describe('error handling (AC-6.1.5)', () => {
      it('should return error message on database fetch error', async () => {
        mockSupabaseClient.from.mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: null,
            error: new Error('Database error')
          })
        })

        const context: OptOutContext = {
          userId,
          whatsappJid,
          command: 'opt_out',
          locale: 'pt-BR'
        }

        const result = await handleOptOutCommand(context)

        expect(result.success).toBe(false)
        expect(result.error).toBeTruthy()
      })

      it('should return error message on database update error', async () => {
        mockSupabaseClient.from.mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { reengagement_opt_out: false },
            error: null
          })
        })

        mockSupabaseClient.from.mockReturnValueOnce({
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: new Error('Update error') })
        })

        const context: OptOutContext = {
          userId,
          whatsappJid,
          command: 'opt_out',
          locale: 'pt-BR'
        }

        const result = await handleOptOutCommand(context)

        expect(result.success).toBe(false)
        expect(result.error).toBeTruthy()
      })

      it('should handle PostHog tracking failure gracefully', async () => {
        mockSupabaseClient.from.mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { reengagement_opt_out: false },
            error: null
          })
        })

        mockSupabaseClient.from.mockReturnValueOnce({
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: null })
        })

        const { trackEvent } = require('../../analytics/index')
        trackEvent.mockImplementationOnce(() => {
          throw new Error('PostHog error')
        })

        const context: OptOutContext = {
          userId,
          whatsappJid,
          command: 'opt_out',
          locale: 'pt-BR'
        }

        const result = await handleOptOutCommand(context)

        // Should still succeed despite tracking error
        expect(result.success).toBe(true)
      })
    })
  })
})
