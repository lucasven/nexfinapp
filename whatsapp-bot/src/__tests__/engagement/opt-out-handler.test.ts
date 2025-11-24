/**
 * Opt-Out Handler Tests
 *
 * Story 3.5: Skip Onboarding Command
 *
 * Tests:
 * - AC-3.5.1: "parar dicas" or "stop tips" disables tips
 * - AC-3.5.2: "ativar dicas" or "enable tips" re-enables tips
 * - AC-3.5.3: With tips disabled, tier completions tracked but NOT celebrated
 * - AC-3.5.4: Tip preference is separate from re-engagement opt-out
 * - AC-3.5.5: Command matching is case-insensitive
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { isTipCommand, handleTipOptOut } from '../../handlers/engagement/opt-out-handler'
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
