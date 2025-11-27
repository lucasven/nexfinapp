/**
 * Goodbye Handler Tests
 *
 * Story 4.4: Goodbye Response Processing
 *
 * Tests:
 * - AC-4.4.1: Response "1" (confused) triggers transition to help_flow, sends help message, restarts Tier 1 hints, then transitions to active
 * - AC-4.4.2: Response "2" (busy) triggers transition to remind_later, sets remind_at = now() + 14 days
 * - AC-4.4.3: Response "3" (all good) triggers transition to dormant
 * - AC-4.4.4: Non-matching responses (other text) trigger transition to active and process normally
 * - AC-4.4.5: Responses match via simple regex including number emoji variants (1, 1️⃣, "confuso", "confused", etc.)
 * - AC-4.4.6: All response confirmations are localized (pt-BR and en)
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

// Mock the state machine
const mockTransitionState = jest.fn()
const mockGetEngagementState = jest.fn()
jest.mock('../../../services/engagement/state-machine', () => ({
  transitionState: (...args: any[]) => mockTransitionState(...args),
  getEngagementState: (...args: any[]) => mockGetEngagementState(...args),
}))

// Mock the message queue
const mockQueueMessage = jest.fn()
jest.mock('../../../services/scheduler/message-sender', () => ({
  queueMessage: (...args: any[]) => mockQueueMessage(...args),
}))

// Mock the message router
const mockGetMessageDestination = jest.fn()
jest.mock('../../../services/engagement/message-router', () => ({
  getMessageDestination: (...args: any[]) => mockGetMessageDestination(...args),
}))

// Mock analytics
const mockTrackEvent = jest.fn()
jest.mock('../../../analytics/index', () => ({
  trackEvent: (...args: any[]) => mockTrackEvent(...args),
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
  isGoodbyeResponse,
  parseGoodbyeResponse,
  processGoodbyeResponse,
  checkAndHandleGoodbyeResponse,
  handleGoodbyeResponse,
} from '../../../handlers/engagement/goodbye-handler'
import type { GoodbyeResponseType } from '../../../handlers/engagement/goodbye-handler'
import { logger } from '../../../services/monitoring/logger'

const mockLogger = logger as jest.Mocked<typeof logger>

describe('Goodbye Handler - Story 4.4', () => {
  const userId = 'test-user-123'
  const defaultEngagementState = {
    user_id: userId,
    state: 'goodbye_sent',
    goodbye_sent_at: new Date().toISOString(),
  }

  beforeEach(() => {
    resetSupabaseMocks()
    mockTransitionState.mockClear()
    mockTransitionState.mockResolvedValue({ success: true, newState: 'active' })
    mockGetEngagementState.mockClear()
    mockGetEngagementState.mockResolvedValue('goodbye_sent')
    mockQueueMessage.mockClear()
    mockQueueMessage.mockResolvedValue(true)
    mockGetMessageDestination.mockClear()
    mockGetMessageDestination.mockResolvedValue({
      destination: 'individual',
      destinationJid: '5511999999999@s.whatsapp.net',
    })
    mockTrackEvent.mockClear()
    mockLogger.info.mockClear()
    mockLogger.warn.mockClear()
    mockLogger.error.mockClear()
    mockLogger.debug.mockClear()
  })

  // =========================================================================
  // AC-4.4.5: Response Pattern Matching
  // =========================================================================

  describe('isGoodbyeResponse - AC-4.4.5', () => {
    describe('confused response patterns (Option 1)', () => {
      it('should match "1"', () => {
        expect(isGoodbyeResponse('1')).toBe('confused')
      })

      it('should match "1️⃣" emoji', () => {
        expect(isGoodbyeResponse('1️⃣')).toBe('confused')
      })

      it('should match "confuso" (pt-BR)', () => {
        expect(isGoodbyeResponse('confuso')).toBe('confused')
      })

      it('should match "confused" (en)', () => {
        expect(isGoodbyeResponse('confused')).toBe('confused')
      })

      it('should match case-insensitively "CONFUSO"', () => {
        expect(isGoodbyeResponse('CONFUSO')).toBe('confused')
      })

      it('should match case-insensitively "Confused"', () => {
        expect(isGoodbyeResponse('Confused')).toBe('confused')
      })

      it('should match with whitespace " 1 "', () => {
        expect(isGoodbyeResponse(' 1 ')).toBe('confused')
      })

      it('should match with whitespace " confuso "', () => {
        expect(isGoodbyeResponse(' confuso ')).toBe('confused')
      })
    })

    describe('busy response patterns (Option 2)', () => {
      it('should match "2"', () => {
        expect(isGoodbyeResponse('2')).toBe('busy')
      })

      it('should match "2️⃣" emoji', () => {
        expect(isGoodbyeResponse('2️⃣')).toBe('busy')
      })

      it('should match "ocupado" (pt-BR)', () => {
        expect(isGoodbyeResponse('ocupado')).toBe('busy')
      })

      it('should match "busy" (en)', () => {
        expect(isGoodbyeResponse('busy')).toBe('busy')
      })

      it('should match case-insensitively "OCUPADO"', () => {
        expect(isGoodbyeResponse('OCUPADO')).toBe('busy')
      })

      it('should match case-insensitively "Busy"', () => {
        expect(isGoodbyeResponse('Busy')).toBe('busy')
      })

      it('should match with whitespace " 2 "', () => {
        expect(isGoodbyeResponse(' 2 ')).toBe('busy')
      })
    })

    describe('all_good response patterns (Option 3)', () => {
      it('should match "3"', () => {
        expect(isGoodbyeResponse('3')).toBe('all_good')
      })

      it('should match "3️⃣" emoji', () => {
        expect(isGoodbyeResponse('3️⃣')).toBe('all_good')
      })

      it('should match "tudo certo" (pt-BR)', () => {
        expect(isGoodbyeResponse('tudo certo')).toBe('all_good')
      })

      it('should match "tudocerto" (pt-BR no space)', () => {
        expect(isGoodbyeResponse('tudocerto')).toBe('all_good')
      })

      it('should match "all good" (en)', () => {
        expect(isGoodbyeResponse('all good')).toBe('all_good')
      })

      it('should match case-insensitively "TUDO CERTO"', () => {
        expect(isGoodbyeResponse('TUDO CERTO')).toBe('all_good')
      })

      it('should match case-insensitively "All Good"', () => {
        expect(isGoodbyeResponse('All Good')).toBe('all_good')
      })

      it('should match with whitespace " 3 "', () => {
        expect(isGoodbyeResponse(' 3 ')).toBe('all_good')
      })
    })

    describe('non-matching patterns', () => {
      it('should return null for regular text "hello"', () => {
        expect(isGoodbyeResponse('hello')).toBeNull()
      })

      it('should return null for expense text "gastei 50"', () => {
        expect(isGoodbyeResponse('gastei 50')).toBeNull()
      })

      it('should return null for commands "/add 50"', () => {
        expect(isGoodbyeResponse('/add 50')).toBeNull()
      })

      it('should return null for numbers outside 1-3 "4"', () => {
        expect(isGoodbyeResponse('4')).toBeNull()
      })

      it('should return null for partial matches "11"', () => {
        expect(isGoodbyeResponse('11')).toBeNull()
      })

      it('should return null for empty string', () => {
        expect(isGoodbyeResponse('')).toBeNull()
      })

      it('should return null for whitespace only', () => {
        expect(isGoodbyeResponse('   ')).toBeNull()
      })
    })
  })

  describe('parseGoodbyeResponse - Legacy Function', () => {
    it('should return 1 for confused responses', () => {
      expect(parseGoodbyeResponse('1')).toBe(1)
      expect(parseGoodbyeResponse('confuso')).toBe(1)
    })

    it('should return 2 for busy responses', () => {
      expect(parseGoodbyeResponse('2')).toBe(2)
      expect(parseGoodbyeResponse('ocupado')).toBe(2)
    })

    it('should return 3 for all_good responses', () => {
      expect(parseGoodbyeResponse('3')).toBe(3)
      expect(parseGoodbyeResponse('tudo certo')).toBe(3)
    })

    it('should return null for non-matching responses', () => {
      expect(parseGoodbyeResponse('hello')).toBeNull()
    })
  })

  // =========================================================================
  // AC-4.4.1: Confused Response (Option 1)
  // =========================================================================

  describe('processGoodbyeResponse - confused (AC-4.4.1)', () => {
    it('should transition to help_flow first', async () => {
      mockQuerySequence([
        { data: defaultEngagementState, error: null }, // days since goodbye
        { data: { id: userId }, error: null }, // reset progress
      ])

      await processGoodbyeResponse(userId, 'confused', 'pt-BR')

      expect(mockTransitionState).toHaveBeenCalledWith(
        userId,
        'goodbye_response_1',
        expect.objectContaining({
          response_type: 'confused',
        })
      )
    })

    it('should reset onboarding progress', async () => {
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
        { data: { id: userId }, error: null },
      ])

      await processGoodbyeResponse(userId, 'confused', 'pt-BR')

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('user_profiles')
    })

    it('should transition to active after help_flow', async () => {
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
        { data: { id: userId }, error: null },
      ])

      await processGoodbyeResponse(userId, 'confused', 'pt-BR')

      // Should be called twice: once for help_flow, once for active
      expect(mockTransitionState).toHaveBeenCalledTimes(2)
      expect(mockTransitionState).toHaveBeenNthCalledWith(
        2,
        userId,
        'user_message',
        expect.objectContaining({
          from_help_flow: true,
        })
      )
    })

    it('should return pt-BR confirmation message', async () => {
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
        { data: { id: userId }, error: null },
      ])

      const result = await processGoodbyeResponse(userId, 'confused', 'pt-BR')

      expect(result.success).toBe(true)
      expect(result.newState).toBe('active')
      expect(result.message).toContain('Sem problemas')
      expect(result.message).toContain('gastei 50 no almoço')
    })

    it('should return en confirmation message', async () => {
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
        { data: { id: userId }, error: null },
      ])

      const result = await processGoodbyeResponse(userId, 'confused', 'en')

      expect(result.success).toBe(true)
      expect(result.message).toContain('No problem')
      expect(result.message).toContain('spent 50 on lunch')
    })

    it('should track analytics event', async () => {
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
        { data: { id: userId }, error: null },
      ])

      await processGoodbyeResponse(userId, 'confused', 'pt-BR')

      expect(mockTrackEvent).toHaveBeenCalledWith(
        'engagement_goodbye_response',
        userId,
        expect.objectContaining({
          response_type: 'confused',
        })
      )
    })

    it('should succeed even when message queueing fails (AC-7.4.9)', async () => {
      mockGetMessageDestination.mockResolvedValue(null)
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
        { data: { id: userId }, error: null },
      ])

      const result = await processGoodbyeResponse(userId, 'confused', 'pt-BR')

      expect(result.success).toBe(true)
      expect(result.newState).toBe('active')
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Cannot queue'),
        expect.objectContaining({ userId })
      )
    })

    it('should handle onboarding reset failure', async () => {
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
        { data: null, error: { message: 'Update failed' } },
      ])

      const result = await processGoodbyeResponse(userId, 'confused', 'pt-BR')

      expect(result.success).toBe(false)
      // Error is logged 3 times: in resetOnboardingProgress, handleConfusedResponse, and processGoodbyeResponse
      expect(mockLogger.error).toHaveBeenCalled()
    })

    it('should handle message queueing errors gracefully', async () => {
      mockGetMessageDestination.mockRejectedValue(new Error('Network error'))
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
        { data: { id: userId }, error: null },
      ])

      const result = await processGoodbyeResponse(userId, 'confused', 'pt-BR')

      expect(result.success).toBe(true)
      expect(result.newState).toBe('active')
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error queueing help restart message'),
        expect.any(Object),
        expect.any(Error)
      )
    })
  })

  // =========================================================================
  // AC-4.4.2: Busy Response (Option 2)
  // =========================================================================

  describe('processGoodbyeResponse - busy (AC-4.4.2)', () => {
    it('should transition to remind_later', async () => {
      mockTransitionState.mockResolvedValue({ success: true, newState: 'remind_later' })
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
      ])

      await processGoodbyeResponse(userId, 'busy', 'pt-BR')

      expect(mockTransitionState).toHaveBeenCalledWith(
        userId,
        'goodbye_response_2',
        expect.objectContaining({
          response_type: 'busy',
        })
      )
    })

    it('should return pt-BR confirmation message', async () => {
      mockTransitionState.mockResolvedValue({ success: true, newState: 'remind_later' })
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
      ])

      const result = await processGoodbyeResponse(userId, 'busy', 'pt-BR')

      expect(result.success).toBe(true)
      expect(result.newState).toBe('remind_later')
      expect(result.message).toContain('Entendido')
      expect(result.message).toContain('2 semanas')
    })

    it('should return en confirmation message', async () => {
      mockTransitionState.mockResolvedValue({ success: true, newState: 'remind_later' })
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
      ])

      const result = await processGoodbyeResponse(userId, 'busy', 'en')

      expect(result.success).toBe(true)
      expect(result.message).toContain('Got it')
      expect(result.message).toContain('2 weeks')
    })

    it('should track analytics event', async () => {
      mockTransitionState.mockResolvedValue({ success: true, newState: 'remind_later' })
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
      ])

      await processGoodbyeResponse(userId, 'busy', 'pt-BR')

      expect(mockTrackEvent).toHaveBeenCalledWith(
        'engagement_goodbye_response',
        userId,
        expect.objectContaining({
          response_type: 'busy',
        })
      )
    })

    it('should handle error in busy response when transition fails', async () => {
      mockTransitionState.mockResolvedValue({
        success: false,
        error: 'Transition failed',
      })
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
      ])

      const result = await processGoodbyeResponse(userId, 'busy', 'pt-BR')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Transition failed')
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to transition to remind_later'),
        expect.any(Object)
      )
    })

    it('should handle unexpected error in busy response', async () => {
      mockTransitionState.mockRejectedValue(new Error('Database error'))
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
      ])

      const result = await processGoodbyeResponse(userId, 'busy', 'pt-BR')

      expect(result.success).toBe(false)
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error handling busy response'),
        expect.any(Object),
        expect.any(Error)
      )
    })
  })

  // =========================================================================
  // AC-4.4.3: All Good Response (Option 3)
  // =========================================================================

  describe('processGoodbyeResponse - all_good (AC-4.4.3)', () => {
    it('should transition to dormant', async () => {
      mockTransitionState.mockResolvedValue({ success: true, newState: 'dormant' })
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
      ])

      await processGoodbyeResponse(userId, 'all_good', 'pt-BR')

      expect(mockTransitionState).toHaveBeenCalledWith(
        userId,
        'goodbye_response_3',
        expect.objectContaining({
          response_type: 'all_good',
        })
      )
    })

    it('should return pt-BR confirmation message', async () => {
      mockTransitionState.mockResolvedValue({ success: true, newState: 'dormant' })
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
      ])

      const result = await processGoodbyeResponse(userId, 'all_good', 'pt-BR')

      expect(result.success).toBe(true)
      expect(result.newState).toBe('dormant')
      expect(result.message).toContain('Tudo certo')
      expect(result.message).toContain('porta está sempre aberta')
    })

    it('should return en confirmation message', async () => {
      mockTransitionState.mockResolvedValue({ success: true, newState: 'dormant' })
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
      ])

      const result = await processGoodbyeResponse(userId, 'all_good', 'en')

      expect(result.success).toBe(true)
      expect(result.message).toContain('All good')
      expect(result.message).toContain('door is always open')
    })

    it('should track analytics event', async () => {
      mockTransitionState.mockResolvedValue({ success: true, newState: 'dormant' })
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
      ])

      await processGoodbyeResponse(userId, 'all_good', 'pt-BR')

      expect(mockTrackEvent).toHaveBeenCalledWith(
        'engagement_goodbye_response',
        userId,
        expect.objectContaining({
          response_type: 'all_good',
        })
      )
    })

    it('should handle error in all_good response when transition fails', async () => {
      mockTransitionState.mockResolvedValue({
        success: false,
        error: 'Transition failed',
      })
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
      ])

      const result = await processGoodbyeResponse(userId, 'all_good', 'pt-BR')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Transition failed')
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to transition to dormant'),
        expect.any(Object)
      )
    })

    it('should handle unexpected error in all_good response', async () => {
      mockTransitionState.mockRejectedValue(new Error('Network error'))
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
      ])

      const result = await processGoodbyeResponse(userId, 'all_good', 'pt-BR')

      expect(result.success).toBe(false)
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error handling all good response'),
        expect.any(Object),
        expect.any(Error)
      )
    })
  })

  // =========================================================================
  // AC-4.4.4: Non-Goodbye Responses
  // =========================================================================

  describe('checkAndHandleGoodbyeResponse - Non-Goodbye Responses (AC-4.4.4)', () => {
    it('should return null when user is not in goodbye_sent state', async () => {
      mockGetEngagementState.mockResolvedValue('active')

      const result = await checkAndHandleGoodbyeResponse(userId, 'hello', 'pt-BR')

      expect(result).toBeNull()
      expect(mockTransitionState).not.toHaveBeenCalled()
    })

    it('should transition to active for non-goodbye text from goodbye_sent state', async () => {
      mockGetEngagementState.mockResolvedValue('goodbye_sent')

      const result = await checkAndHandleGoodbyeResponse(userId, 'gastei 50 no almoço', 'pt-BR')

      expect(result).toBeNull()
      expect(mockTransitionState).toHaveBeenCalledWith(
        userId,
        'user_message',
        expect.objectContaining({
          from_goodbye_sent: true,
          non_response_text: true,
        })
      )
    })

    it('should return null to allow normal processing after transition', async () => {
      mockGetEngagementState.mockResolvedValue('goodbye_sent')

      const result = await checkAndHandleGoodbyeResponse(userId, 'ajuda', 'pt-BR')

      expect(result).toBeNull()
    })
  })

  // =========================================================================
  // AC-4.4.6: Localization
  // =========================================================================

  describe('Localization (AC-4.4.6)', () => {
    it('should use pt-BR messages by default', async () => {
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
      ])

      const result = await processGoodbyeResponse(userId, 'all_good')

      expect(result.message).toContain('Tudo certo')
    })

    it('should use en messages when specified', async () => {
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
      ])
      mockTransitionState.mockResolvedValue({ success: true, newState: 'dormant' })

      const result = await processGoodbyeResponse(userId, 'all_good', 'en')

      expect(result.message).toContain('All good')
    })
  })

  // =========================================================================
  // Legacy Handler Compatibility
  // =========================================================================

  describe('handleGoodbyeResponse - Legacy Handler', () => {
    it('should map response option 1 to confused', async () => {
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
        { data: { id: userId }, error: null },
      ])

      const result = await handleGoodbyeResponse({
        userId,
        responseOption: 1,
      })

      expect(mockTransitionState).toHaveBeenCalledWith(
        userId,
        'goodbye_response_1',
        expect.any(Object)
      )
      expect(result.success).toBe(true)
    })

    it('should map response option 2 to busy', async () => {
      mockTransitionState.mockResolvedValue({ success: true, newState: 'remind_later' })
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
      ])

      const result = await handleGoodbyeResponse({
        userId,
        responseOption: 2,
      })

      expect(mockTransitionState).toHaveBeenCalledWith(
        userId,
        'goodbye_response_2',
        expect.any(Object)
      )
      expect(result.success).toBe(true)
    })

    it('should map response option 3 to all_good', async () => {
      mockTransitionState.mockResolvedValue({ success: true, newState: 'dormant' })
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
      ])

      const result = await handleGoodbyeResponse({
        userId,
        responseOption: 3,
      })

      expect(mockTransitionState).toHaveBeenCalledWith(
        userId,
        'goodbye_response_3',
        expect.any(Object)
      )
      expect(result.success).toBe(true)
    })
  })

  // =========================================================================
  // Error Handling
  // =========================================================================

  describe('Error Handling', () => {
    it('should return shouldProcessNormally when user not in goodbye_sent state', async () => {
      mockGetEngagementState.mockResolvedValue('active')

      const result = await processGoodbyeResponse(userId, 'busy', 'pt-BR')

      expect(result.success).toBe(true)
      expect(result.shouldProcessNormally).toBe(true)
      expect(result.newState).toBe('active')
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('User not in goodbye_sent state'),
        expect.any(Object)
      )
    })

    it('should handle error when help_flow transition fails in confused response', async () => {
      mockTransitionState.mockResolvedValue({
        success: false,
        error: 'State transition failed',
      })
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
      ])

      const result = await processGoodbyeResponse(userId, 'confused', 'pt-BR')

      expect(result.success).toBe(false)
      expect(result.error).toBe('State transition failed')
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to transition to help_flow'),
        expect.any(Object)
      )
    })

    it('should handle transition failure gracefully', async () => {
      mockTransitionState.mockResolvedValue({
        success: false,
        error: 'State transition failed',
      })
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
      ])

      const result = await processGoodbyeResponse(userId, 'busy', 'pt-BR')

      expect(result.success).toBe(false)
      expect(result.error).toContain('transition')
    })

    it('should handle unexpected errors in processGoodbyeResponse', async () => {
      mockGetEngagementState.mockRejectedValue(new Error('Database connection failed'))

      const result = await processGoodbyeResponse(userId, 'busy', 'pt-BR')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Database connection failed')
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error processing goodbye response'),
        expect.any(Object),
        expect.any(Error)
      )
    })

    it('should return error message in checkAndHandleGoodbyeResponse', async () => {
      mockGetEngagementState.mockResolvedValue('goodbye_sent')
      mockTransitionState.mockResolvedValue({
        success: false,
        error: 'Database error',
      })
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
      ])

      const result = await checkAndHandleGoodbyeResponse(userId, '3', 'pt-BR')

      expect(result).toContain('Desculpa')
    })

    it('should return English error message when locale is en', async () => {
      mockGetEngagementState.mockResolvedValue('goodbye_sent')
      mockTransitionState.mockResolvedValue({
        success: false,
        error: 'Database error',
      })
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
      ])

      const result = await checkAndHandleGoodbyeResponse(userId, '3', 'en')

      expect(result).toContain('Sorry')
    })

    it('should continue with confused response even if active transition fails (AC-7.4.10)', async () => {
      mockQuerySequence([
        { data: defaultEngagementState, error: null },
        { data: { id: userId }, error: null },
      ])
      // First transition (help_flow) succeeds, second (active) fails
      mockTransitionState
        .mockResolvedValueOnce({ success: true, newState: 'help_flow' })
        .mockResolvedValueOnce({ success: false, error: 'Active transition failed' })

      const result = await processGoodbyeResponse(userId, 'confused', 'pt-BR')

      expect(result.success).toBe(true)
      expect(result.message).toContain('Sem problemas')
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to transition from help_flow to active'),
        expect.any(Object)
      )
    })
  })

  // =========================================================================
  // Days Since Goodbye Calculation (AC-7.4.10)
  // =========================================================================

  describe('Days Since Goodbye Calculation (AC-7.4.10)', () => {
    it('should calculate days correctly with recent goodbye', async () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      mockQuerySequence([
        { data: { ...defaultEngagementState, goodbye_sent_at: yesterday.toISOString() }, error: null },
      ])
      mockTransitionState.mockResolvedValue({ success: true, newState: 'dormant' })

      await processGoodbyeResponse(userId, 'all_good', 'pt-BR')

      expect(mockTrackEvent).toHaveBeenCalledWith(
        'engagement_goodbye_response',
        userId,
        expect.objectContaining({
          days_since_goodbye: 1,
        })
      )
    })

    it('should calculate days correctly with old goodbye', async () => {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      mockQuerySequence([
        { data: { ...defaultEngagementState, goodbye_sent_at: sevenDaysAgo.toISOString() }, error: null },
      ])
      mockTransitionState.mockResolvedValue({ success: true, newState: 'dormant' })

      await processGoodbyeResponse(userId, 'all_good', 'pt-BR')

      expect(mockTrackEvent).toHaveBeenCalledWith(
        'engagement_goodbye_response',
        userId,
        expect.objectContaining({
          days_since_goodbye: 7,
        })
      )
    })

    it('should default to 0 when goodbye_sent_at is missing', async () => {
      mockQuerySequence([
        { data: { ...defaultEngagementState, goodbye_sent_at: null }, error: null },
      ])
      mockTransitionState.mockResolvedValue({ success: true, newState: 'dormant' })

      await processGoodbyeResponse(userId, 'all_good', 'pt-BR')

      expect(mockTrackEvent).toHaveBeenCalledWith(
        'engagement_goodbye_response',
        userId,
        expect.objectContaining({
          days_since_goodbye: 0,
        })
      )
    })

    it('should default to 0 on database error', async () => {
      mockQuerySequence([
        { data: null, error: { message: 'Database error' } },
      ])
      mockTransitionState.mockResolvedValue({ success: true, newState: 'dormant' })

      await processGoodbyeResponse(userId, 'all_good', 'pt-BR')

      expect(mockTrackEvent).toHaveBeenCalledWith(
        'engagement_goodbye_response',
        userId,
        expect.objectContaining({
          days_since_goodbye: 0,
        })
      )
    })
  })

  // =========================================================================
  // Non-Goodbye Response from Active State (AC-7.4.7)
  // =========================================================================

  describe('Goodbye-like text from non-goodbye_sent state (AC-7.4.7)', () => {
    it('should return null and not transition when user in active state sends "1"', async () => {
      mockGetEngagementState.mockResolvedValue('active')

      const result = await checkAndHandleGoodbyeResponse(userId, '1', 'pt-BR')

      expect(result).toBeNull()
      expect(mockTransitionState).not.toHaveBeenCalled()
    })

    it('should return null and not transition when user in active state sends "confuso"', async () => {
      mockGetEngagementState.mockResolvedValue('active')

      const result = await checkAndHandleGoodbyeResponse(userId, 'confuso', 'pt-BR')

      expect(result).toBeNull()
      expect(mockTransitionState).not.toHaveBeenCalled()
    })

    it('should return null and not transition when user in dormant state sends goodbye pattern', async () => {
      mockGetEngagementState.mockResolvedValue('dormant')

      const result = await checkAndHandleGoodbyeResponse(userId, '2', 'pt-BR')

      expect(result).toBeNull()
      expect(mockTransitionState).not.toHaveBeenCalled()
    })
  })
})
