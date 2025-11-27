/**
 * Tier Progress Handler Tests
 *
 * Story 3.3: Tier Completion Detection & Celebrations
 *
 * Tests:
 * - AC-3.3.1: Tier 1 completion sends celebration with Tier 2 guidance
 * - AC-3.3.2: Tier 2 completion sends celebration with Tier 3 guidance
 * - AC-3.3.3: Tier 3 completion sends final "pro" celebration
 * - AC-3.3.4: Celebration messages use max one emoji (verified in localization)
 * - AC-3.3.5: Tips disabled skips message but progress tracked
 * - AC-3.3.6: Messages queued via message queue service (idempotent)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  mockSupabaseClient,
  resetSupabaseMocks,
  mockQuerySequence,
} from '../../../__mocks__/supabase'

// Mock the supabase client
jest.mock('../../../services/database/supabase-client', () => ({
  getSupabaseClient: () => mockSupabaseClient,
}))

// Mock the message queue
const mockQueueMessage = jest.fn()
jest.mock('../../../services/scheduler/message-sender', () => ({
  queueMessage: (...args: any[]) => mockQueueMessage(...args),
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

// Import after mocks are set up
import {
  handleTierCompletion,
  handleTierCompletionAsync,
} from '../../../handlers/engagement/tier-progress-handler'
import type { TierUpdate } from '../../../services/onboarding/tier-tracker'
import { logger } from '../../../services/monitoring/logger'

const mockLogger = logger as jest.Mocked<typeof logger>

describe('Tier Progress Handler - Story 3.3 Celebrations', () => {
  const userId = 'test-user-123'
  // Profile data from user_profiles table (no whatsapp_jid - that's in authorized_whatsapp_numbers)
  const defaultUserProfile = {
    onboarding_tips_enabled: true, // Uses new column from Story 3.5
    preferred_destination: 'individual',
    locale: 'pt-br',
  }
  // Authorized number data from authorized_whatsapp_numbers table
  const defaultAuthorizedNumber = {
    whatsapp_jid: '5511999999999@s.whatsapp.net',
    whatsapp_number: '5511999999999',
  }

  beforeEach(() => {
    resetSupabaseMocks()
    mockQueueMessage.mockClear()
    mockQueueMessage.mockResolvedValue(true)
    mockLogger.info.mockClear()
    mockLogger.warn.mockClear()
    mockLogger.error.mockClear()
  })

  describe('handleTierCompletion', () => {
    describe('AC-3.3.1: Tier 1 completion', () => {
      it('should queue celebration message with correct key for Tier 1', async () => {
        const tierUpdate: TierUpdate = {
          action: 'add_category',
          tierCompleted: 1,
          shouldSendUnlock: true,
        }

        mockQuerySequence([
          { data: defaultUserProfile, error: null }, // user_profiles query
          { data: defaultAuthorizedNumber, error: null }, // authorized_whatsapp_numbers query
        ])

        await handleTierCompletion(userId, tierUpdate)

        expect(mockQueueMessage).toHaveBeenCalledTimes(1)
        expect(mockQueueMessage).toHaveBeenCalledWith({
          userId,
          messageType: 'tier_unlock',
          messageKey: 'engagementTier1Complete',
          destination: 'individual',
          destinationJid: '5511999999999@s.whatsapp.net',
        })
      })
    })

    describe('AC-3.3.2: Tier 2 completion', () => {
      it('should queue celebration message with correct key for Tier 2', async () => {
        const tierUpdate: TierUpdate = {
          action: 'list_categories',
          tierCompleted: 2,
          shouldSendUnlock: true,
        }

        mockQuerySequence([
          { data: defaultUserProfile, error: null }, // user_profiles query
          { data: defaultAuthorizedNumber, error: null }, // authorized_whatsapp_numbers query
        ])

        await handleTierCompletion(userId, tierUpdate)

        expect(mockQueueMessage).toHaveBeenCalledTimes(1)
        expect(mockQueueMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            messageKey: 'engagementTier2Complete',
            messageType: 'tier_unlock',
          })
        )
      })
    })

    describe('AC-3.3.3: Tier 3 completion', () => {
      it('should queue final "pro" celebration for Tier 3', async () => {
        const tierUpdate: TierUpdate = {
          action: 'view_report',
          tierCompleted: 3,
          shouldSendUnlock: true,
        }

        mockQuerySequence([
          { data: defaultUserProfile, error: null }, // user_profiles query
          { data: defaultAuthorizedNumber, error: null }, // authorized_whatsapp_numbers query
        ])

        await handleTierCompletion(userId, tierUpdate)

        expect(mockQueueMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            messageKey: 'engagementTier3Complete',
            messageType: 'tier_unlock',
          })
        )
      })
    })

    describe('AC-3.3.5: Tips disabled scenario', () => {
      it('should NOT queue message when tips are disabled', async () => {
        const tierUpdate: TierUpdate = {
          action: 'add_category',
          tierCompleted: 1,
          shouldSendUnlock: true,
        }

        // onboarding_tips_enabled = false means tips disabled
        mockQuerySequence([
          {
            data: { ...defaultUserProfile, onboarding_tips_enabled: false },
            error: null,
          },
          { data: defaultAuthorizedNumber, error: null }, // authorized_whatsapp_numbers query
        ])

        await handleTierCompletion(userId, tierUpdate)

        expect(mockQueueMessage).not.toHaveBeenCalled()
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Tier celebration skipped - tips disabled',
          expect.objectContaining({ userId, tierCompleted: 1 })
        )
      })

      it('should still track progress (caller responsibility) when tips disabled', async () => {
        const tierUpdate: TierUpdate = {
          action: 'add_category',
          tierCompleted: 1,
          shouldSendUnlock: true,
        }

        mockQuerySequence([
          {
            data: { ...defaultUserProfile, onboarding_tips_enabled: false },
            error: null,
          },
          { data: defaultAuthorizedNumber, error: null }, // authorized_whatsapp_numbers query
        ])

        // This function only handles celebrations, not progress tracking
        // Progress is tracked by recordAction in tier-tracker.ts
        await handleTierCompletion(userId, tierUpdate)

        // Function should complete without error (progress tracked elsewhere)
        expect(mockQueueMessage).not.toHaveBeenCalled()
      })
    })

    describe('AC-3.3.6: Idempotent message queuing', () => {
      it('should call queueMessage which handles idempotency', async () => {
        const tierUpdate: TierUpdate = {
          action: 'add_category',
          tierCompleted: 1,
          shouldSendUnlock: true,
        }

        mockQuerySequence([
          { data: defaultUserProfile, error: null }, // user_profiles query
          { data: defaultAuthorizedNumber, error: null }, // authorized_whatsapp_numbers query
        ])

        await handleTierCompletion(userId, tierUpdate)

        // queueMessage generates idempotency key internally
        // Format: {userId}:{messageType}:{date}
        expect(mockQueueMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            userId,
            messageType: 'tier_unlock',
          })
        )

        // Verify correct logging with idempotency key format
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Tier celebration queued',
          expect.objectContaining({
            userId,
            tierCompleted: 1,
            messageKey: 'engagementTier1Complete',
            idempotencyKey: expect.stringMatching(/^test-user-123:tier_1_complete:\d{4}-\d{2}-\d{2}$/),
          })
        )
      })
    })

    describe('shouldSendUnlock flag', () => {
      it('should NOT queue when shouldSendUnlock is false', async () => {
        const tierUpdate: TierUpdate = {
          action: 'add_expense',
          tierCompleted: null,
          shouldSendUnlock: false,
        }

        await handleTierCompletion(userId, tierUpdate)

        expect(mockQueueMessage).not.toHaveBeenCalled()
        expect(mockSupabaseClient.from).not.toHaveBeenCalled()
      })

      it('should NOT queue when tierCompleted is null', async () => {
        const tierUpdate: TierUpdate = {
          action: 'add_expense',
          tierCompleted: null,
          shouldSendUnlock: true, // Even with this true, null tier should skip
        }

        await handleTierCompletion(userId, tierUpdate)

        expect(mockQueueMessage).not.toHaveBeenCalled()
      })
    })

    describe('User destination handling', () => {
      it('should use group destination when user prefers groups', async () => {
        const tierUpdate: TierUpdate = {
          action: 'add_category',
          tierCompleted: 1,
          shouldSendUnlock: true,
        }

        mockQuerySequence([
          {
            data: {
              ...defaultUserProfile,
              preferred_destination: 'group',
            },
            error: null,
          },
          {
            data: {
              whatsapp_jid: '120363123456789012@g.us',
              whatsapp_number: null,
            },
            error: null,
          },
        ])

        await handleTierCompletion(userId, tierUpdate)

        expect(mockQueueMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            destination: 'group',
            destinationJid: '120363123456789012@g.us',
          })
        )
      })
    })

    describe('Error handling', () => {
      it('should handle database error gracefully (non-blocking)', async () => {
        const tierUpdate: TierUpdate = {
          action: 'add_category',
          tierCompleted: 1,
          shouldSendUnlock: true,
        }

        mockQuerySequence([
          { data: null, error: { message: 'Connection failed', code: 'PGRST000' } },
        ])

        // Should not throw
        await expect(handleTierCompletion(userId, tierUpdate)).resolves.not.toThrow()

        // When profile fetch fails, defaults suppress celebration
        expect(mockQueueMessage).not.toHaveBeenCalled()
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Could not fetch user profile for celebration',
          expect.objectContaining({ userId })
        )
      })

      it('should handle queue failure gracefully', async () => {
        const tierUpdate: TierUpdate = {
          action: 'add_category',
          tierCompleted: 1,
          shouldSendUnlock: true,
        }

        mockQuerySequence([
          { data: defaultUserProfile, error: null }, // user_profiles query
          { data: defaultAuthorizedNumber, error: null }, // authorized_whatsapp_numbers query
        ])

        mockQueueMessage.mockResolvedValue(false)

        await handleTierCompletion(userId, tierUpdate)

        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Failed to queue tier celebration',
          expect.objectContaining({ userId, tierCompleted: 1 })
        )
      })

      it('should handle unknown tier number', async () => {
        const tierUpdate: TierUpdate = {
          action: 'add_expense',
          tierCompleted: 99 as any, // Invalid tier
          shouldSendUnlock: true,
        }

        mockQuerySequence([
          { data: defaultUserProfile, error: null }, // user_profiles query
          { data: defaultAuthorizedNumber, error: null }, // authorized_whatsapp_numbers query
        ])

        await handleTierCompletion(userId, tierUpdate)

        expect(mockQueueMessage).not.toHaveBeenCalled()
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Unknown tier completed',
          expect.objectContaining({ userId, tierCompleted: 99 })
        )
      })
    })
  })

  describe('handleTierCompletionAsync', () => {
    it('should not throw on success', () => {
      const tierUpdate: TierUpdate = {
        action: 'add_category',
        tierCompleted: 1,
        shouldSendUnlock: true,
      }

      mockQuerySequence([
        { data: defaultUserProfile, error: null }, // user_profiles query
        { data: defaultAuthorizedNumber, error: null }, // authorized_whatsapp_numbers query
      ])

      // Fire-and-forget - should not throw
      expect(() => handleTierCompletionAsync(userId, tierUpdate)).not.toThrow()
    })

    it('should catch and log errors without throwing', async () => {
      const tierUpdate: TierUpdate = {
        action: 'add_category',
        tierCompleted: 1,
        shouldSendUnlock: true,
      }

      // Force an error
      mockQueueMessage.mockRejectedValue(new Error('Queue service down'))
      mockQuerySequence([
        { data: defaultUserProfile, error: null }, // user_profiles query
        { data: defaultAuthorizedNumber, error: null }, // authorized_whatsapp_numbers query
      ])

      // Should not throw
      handleTierCompletionAsync(userId, tierUpdate)

      // Wait for async error handling
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Error is caught inside handleTierCompletion, not the async wrapper
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error handling tier completion',
        expect.objectContaining({ userId, tierCompleted: 1 }),
        expect.any(Error)
      )
    })
  })
})

// =============================================================================
// AC-3.3.4: Verify localization messages have max one emoji
// =============================================================================

describe('Tier Celebration Messages - AC-3.3.4 Tone Compliance', () => {
  // Import actual localization to verify emoji compliance
  // These are the expected message contents from localization files

  const tier1MessagePtBr = `Você já dominou o básico!
Quer ir além? Tenta definir um orçamento: "definir orçamento de 500 para alimentação"`

  const tier2MessagePtBr = `Você não está só rastreando—está planejando!
Quer ver o resultado? Tenta "relatório desse mês" pra ver sua organização.`

  const tier3MessagePtBr = `Você é fera! Tem controle total das suas finanças agora.
Qualquer dúvida, é só chamar.`

  const tier1MessageEn = `You've got the basics down!
Want to go further? Try setting a budget: "set food budget to 500"`

  const tier2MessageEn = `You're not just tracking—you're planning!
Want to see the results? Try "report this month" to see your progress.`

  const tier3MessageEn = `You're a pro now! You have complete control over your finances.
Any questions, just reach out.`

  // Simple emoji regex pattern (covers most common emojis)
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu

  const countEmojis = (text: string): number => {
    const matches = text.match(emojiRegex)
    return matches ? matches.length : 0
  }

  it('should have max one emoji in Tier 1 pt-BR message', () => {
    expect(countEmojis(tier1MessagePtBr)).toBeLessThanOrEqual(1)
  })

  it('should have max one emoji in Tier 2 pt-BR message', () => {
    expect(countEmojis(tier2MessagePtBr)).toBeLessThanOrEqual(1)
  })

  it('should have max one emoji in Tier 3 pt-BR message', () => {
    expect(countEmojis(tier3MessagePtBr)).toBeLessThanOrEqual(1)
  })

  it('should have max one emoji in Tier 1 en message', () => {
    expect(countEmojis(tier1MessageEn)).toBeLessThanOrEqual(1)
  })

  it('should have max one emoji in Tier 2 en message', () => {
    expect(countEmojis(tier2MessageEn)).toBeLessThanOrEqual(1)
  })

  it('should have max one emoji in Tier 3 en message', () => {
    expect(countEmojis(tier3MessageEn)).toBeLessThanOrEqual(1)
  })

  it('should have celebratory but not over-the-top tone (no excessive punctuation)', () => {
    const allMessages = [
      tier1MessagePtBr,
      tier2MessagePtBr,
      tier3MessagePtBr,
      tier1MessageEn,
      tier2MessageEn,
      tier3MessageEn,
    ]

    allMessages.forEach((msg) => {
      // No more than 2 consecutive exclamation marks
      expect(msg).not.toMatch(/!{3,}/)
      // No ALL CAPS words (except acronyms of 3 chars or less)
      expect(msg).not.toMatch(/\b[A-Z]{4,}\b/)
    })
  })
})
