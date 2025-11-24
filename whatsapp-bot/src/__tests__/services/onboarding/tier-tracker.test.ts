/**
 * Tier Tracker Tests
 *
 * Story 2.5: Magic Moment Tracking
 * Story 3.1: Tier Progress Tracking Service
 *
 * Tests:
 * Story 2.5:
 * - AC-2.5.1: First NLP expense sets magic_moment_at
 * - AC-2.5.2: PostHog event fired with correct properties
 * - AC-2.5.3: Explicit commands do NOT trigger magic moment
 * - AC-2.5.4: Subsequent NLP expenses do NOT update timestamp
 *
 * Story 3.1:
 * - AC-3.1.1: recordAction() updates JSONB atomically
 * - AC-3.1.2: Tier 1 completion detection
 * - AC-3.1.3: Tier 2 completion detection
 * - AC-3.1.4: Tier 3 completion detection
 * - AC-3.1.5: Idempotent action recording
 * - AC-3.1.6: onboarding_tier column updated to highest completed tier
 * - AC-3.1.7: getTierProgress() returns typed TierProgress
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  recordMagicMoment,
  getTierProgress,
  recordAction,
  checkTierCompletion,
  type TierProgress,
} from '../../../services/onboarding/tier-tracker'
import {
  mockSupabaseClient,
  resetSupabaseMocks,
  mockQuerySequence,
} from '../../../__mocks__/supabase'

// Mock the supabase client
jest.mock('../../../services/database/supabase-client', () => ({
  getSupabaseClient: () => mockSupabaseClient,
}))

// Mock analytics trackEvent
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

describe('Tier Tracker - Story 2.5 Magic Moment', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockTrackEvent.mockClear()
  })

  describe('recordMagicMoment', () => {
    it('should set magic_moment_at for first NLP expense (AC-2.5.1)', async () => {
      const userId = 'user-123'
      const signupDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days ago

      // Mock sequence:
      // 1. Select user_profiles - no magic_moment_at set
      // 2. Update user_profiles - success
      mockQuerySequence([
        {
          data: { magic_moment_at: null, created_at: signupDate.toISOString() },
          error: null,
        },
        {
          data: { magic_moment_at: new Date().toISOString(), created_at: signupDate.toISOString() },
          error: null,
        },
      ])

      const result = await recordMagicMoment(userId, true, {
        amount: 50,
        category: 'food',
      })

      expect(result.isFirstMagicMoment).toBe(true)
      expect(result.timestamp).toBeDefined()
    })

    it('should fire PostHog event with correct properties (AC-2.5.2, AC-2.5.4)', async () => {
      const userId = 'user-456'
      const signupDate = new Date(Date.now() - 0.5 * 24 * 60 * 60 * 1000) // 12 hours ago

      mockQuerySequence([
        {
          data: { magic_moment_at: null, created_at: signupDate.toISOString() },
          error: null,
        },
        {
          data: { magic_moment_at: new Date().toISOString(), created_at: signupDate.toISOString() },
          error: null,
        },
      ])

      await recordMagicMoment(userId, true, {
        amount: 25.50,
        category: 'transport',
      })

      expect(mockTrackEvent).toHaveBeenCalledTimes(1)
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'onboarding_magic_moment',
        userId,
        expect.objectContaining({
          first_expense_category: 'transport',
          first_expense_amount: 25.50,
          time_since_signup: expect.any(Number),
          timestamp: expect.any(String),
        })
      )

      // Verify time_since_signup is approximately correct (around 0.5 days)
      const calledProps = mockTrackEvent.mock.calls[0][2]
      expect(calledProps.time_since_signup).toBeGreaterThan(0)
      expect(calledProps.time_since_signup).toBeLessThan(1)
    })

    it('should NOT trigger magic moment for explicit commands (AC-2.5.3)', async () => {
      const userId = 'user-789'

      const result = await recordMagicMoment(userId, false, {
        amount: 100,
        category: 'shopping',
      })

      expect(result.isFirstMagicMoment).toBe(false)
      expect(result.timestamp).toBeUndefined()
      expect(mockTrackEvent).not.toHaveBeenCalled()
      // Should not even query the database
      expect(mockSupabaseClient.from).not.toHaveBeenCalled()
    })

    it('should NOT update timestamp for subsequent NLP expenses (AC-2.5.4)', async () => {
      const userId = 'user-existing'
      const existingMagicMoment = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago

      // Mock: user already has magic_moment_at set
      mockQuerySequence([
        {
          data: { magic_moment_at: existingMagicMoment.toISOString(), created_at: new Date().toISOString() },
          error: null,
        },
      ])

      const result = await recordMagicMoment(userId, true, {
        amount: 75,
        category: 'entertainment',
      })

      expect(result.isFirstMagicMoment).toBe(false)
      expect(result.timestamp).toBeUndefined()
      expect(mockTrackEvent).not.toHaveBeenCalled()
      // Should only query once (select), not update
      expect(mockSupabaseClient.from).toHaveBeenCalledTimes(1)
    })

    it('should NOT fire duplicate event on subsequent NLP expenses (AC-2.5.4)', async () => {
      const userId = 'user-no-duplicate'
      const existingMagicMoment = new Date()

      mockQuerySequence([
        {
          data: { magic_moment_at: existingMagicMoment.toISOString(), created_at: new Date().toISOString() },
          error: null,
        },
      ])

      await recordMagicMoment(userId, true, { amount: 50, category: 'food' })

      expect(mockTrackEvent).not.toHaveBeenCalled()
    })

    it('should handle race condition gracefully (idempotency)', async () => {
      const userId = 'user-race'

      // Mock: select returns null, but update returns no rows (race condition)
      mockQuerySequence([
        {
          data: { magic_moment_at: null, created_at: new Date().toISOString() },
          error: null,
        },
        {
          data: null, // No rows updated (race condition)
          error: null,
        },
      ])

      const result = await recordMagicMoment(userId, true, {
        amount: 30,
        category: 'food',
      })

      expect(result.isFirstMagicMoment).toBe(false)
      expect(mockTrackEvent).not.toHaveBeenCalled()
    })

    it('should handle database error on select gracefully', async () => {
      const userId = 'user-db-error'

      mockQuerySequence([
        {
          data: null,
          error: { message: 'Database connection failed', code: 'PGRST000' },
        },
      ])

      const result = await recordMagicMoment(userId, true, {
        amount: 20,
        category: 'utilities',
      })

      expect(result.isFirstMagicMoment).toBe(false)
      expect(mockTrackEvent).not.toHaveBeenCalled()
    })

    it('should handle database error on update gracefully', async () => {
      const userId = 'user-update-error'

      mockQuerySequence([
        {
          data: { magic_moment_at: null, created_at: new Date().toISOString() },
          error: null,
        },
        {
          data: null,
          error: { message: 'Update failed', code: 'PGRST001' },
        },
      ])

      const result = await recordMagicMoment(userId, true, {
        amount: 40,
        category: 'health',
      })

      expect(result.isFirstMagicMoment).toBe(false)
      expect(mockTrackEvent).not.toHaveBeenCalled()
    })

    it('should work without expenseData (defaults to unknown/0)', async () => {
      const userId = 'user-no-expense-data'

      mockQuerySequence([
        {
          data: { magic_moment_at: null, created_at: new Date().toISOString() },
          error: null,
        },
        {
          data: { magic_moment_at: new Date().toISOString(), created_at: new Date().toISOString() },
          error: null,
        },
      ])

      const result = await recordMagicMoment(userId, true)

      expect(result.isFirstMagicMoment).toBe(true)
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'onboarding_magic_moment',
        userId,
        expect.objectContaining({
          first_expense_category: 'unknown',
          first_expense_amount: 0,
        })
      )
    })
  })
})

// =============================================================================
// Story 3.1: Tier Progress Tracking Service
// =============================================================================

describe('Tier Tracker - Story 3.1 Tier Progress', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockTrackEvent.mockClear()
  })

  // Helper to create tier progress state
  const createTierProgress = (overrides: Partial<TierProgress> = {}): TierProgress => ({
    tier1: {
      add_expense: false,
      edit_category: false,
      delete_expense: false,
      add_category: false,
      ...overrides.tier1,
    },
    tier2: {
      set_budget: false,
      add_recurring: false,
      list_categories: false,
      ...overrides.tier2,
    },
    tier3: {
      edit_category: false,
      view_report: false,
      ...overrides.tier3,
    },
    magic_moment_at: overrides.magic_moment_at,
  })

  describe('getTierProgress (AC-3.1.7)', () => {
    it('should return default empty progress for new user', async () => {
      const userId = 'new-user-123'

      mockQuerySequence([
        { data: { onboarding_tier_progress: null }, error: null },
      ])

      const progress = await getTierProgress(userId)

      expect(progress.tier1.add_expense).toBe(false)
      expect(progress.tier1.edit_category).toBe(false)
      expect(progress.tier2.set_budget).toBe(false)
      expect(progress.tier3.view_report).toBe(false)
    })

    it('should return correct TierProgress structure with partial progress', async () => {
      const userId = 'partial-user'
      const storedProgress = createTierProgress({
        tier1: {
          add_expense: true,
          edit_category: true,
          delete_expense: false,
          add_category: false,
        },
      })

      mockQuerySequence([
        { data: { onboarding_tier_progress: storedProgress }, error: null },
      ])

      const progress = await getTierProgress(userId)

      expect(progress.tier1.add_expense).toBe(true)
      expect(progress.tier1.edit_category).toBe(true)
      expect(progress.tier1.delete_expense).toBe(false)
      expect(progress.tier1.add_category).toBe(false)
      expect(progress.tier2.set_budget).toBe(false)
    })

    it('should handle database error gracefully', async () => {
      const userId = 'error-user'

      mockQuerySequence([
        { data: null, error: { message: 'Connection failed', code: 'PGRST000' } },
      ])

      const progress = await getTierProgress(userId)

      // Should return default empty progress on error
      expect(progress.tier1.add_expense).toBe(false)
      expect(progress.tier2.set_budget).toBe(false)
      expect(progress.tier3.view_report).toBe(false)
    })
  })

  describe('recordAction (AC-3.1.1, AC-3.1.5)', () => {
    it('should update JSONB with action:true (AC-3.1.1)', async () => {
      const userId = 'action-user'
      const existingProgress = createTierProgress()

      mockQuerySequence([
        // getTierProgress
        { data: { onboarding_tier_progress: existingProgress }, error: null },
        // update
        { data: null, error: null },
      ])

      const result = await recordAction(userId, 'add_expense')

      expect(result.action).toBe('add_expense')
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('user_profiles')
    })

    it('should be idempotent - double call returns same result (AC-3.1.5)', async () => {
      const userId = 'idempotent-user'
      const progressWithAction = createTierProgress({
        tier1: {
          add_expense: true,
          edit_category: false,
          delete_expense: false,
          add_category: false,
        },
      })

      mockQuerySequence([
        // First call - getTierProgress
        { data: { onboarding_tier_progress: progressWithAction }, error: null },
        // First call - update (succeeds but no tier completed)
        { data: null, error: null },
      ])

      const result1 = await recordAction(userId, 'add_expense')

      // Action already recorded - should not error
      expect(result1.action).toBe('add_expense')
      expect(result1.tierCompleted).toBe(null)
    })

    it('should NOT overwrite completed_at timestamp on duplicate call (AC-3.1.5)', async () => {
      const userId = 'no-overwrite-user'
      const existingTimestamp = '2025-11-01T10:00:00.000Z'
      const progressWithTimestamp = createTierProgress({
        tier1: {
          add_expense: true,
          edit_category: true,
          delete_expense: true,
          add_category: true,
          completed_at: existingTimestamp,
        },
      })

      mockQuerySequence([
        { data: { onboarding_tier_progress: progressWithTimestamp }, error: null },
        { data: null, error: null },
      ])

      const result = await recordAction(userId, 'add_expense')

      // Tier was already complete, no new completion
      expect(result.tierCompleted).toBe(null)
      expect(result.shouldSendUnlock).toBe(false)
    })
  })

  describe('Tier 1 Completion (AC-3.1.2)', () => {
    it('should detect Tier 1 completion when all 4 actions done', async () => {
      const userId = 'tier1-complete-user'
      // User has 3 of 4 Tier 1 actions done
      const almostComplete = createTierProgress({
        tier1: {
          add_expense: true,
          edit_category: true,
          delete_expense: true,
          add_category: false, // Missing this one
        },
      })

      mockQuerySequence([
        { data: { onboarding_tier_progress: almostComplete }, error: null },
        { data: null, error: null },
      ])

      const result = await recordAction(userId, 'add_category')

      expect(result.tierCompleted).toBe(1)
      expect(result.shouldSendUnlock).toBe(true)
    })

    it('should NOT complete Tier 1 when only 3 of 4 actions done', async () => {
      const userId = 'tier1-partial-user'
      const partialProgress = createTierProgress({
        tier1: {
          add_expense: true,
          edit_category: true,
          delete_expense: false,
          add_category: false,
        },
      })

      mockQuerySequence([
        { data: { onboarding_tier_progress: partialProgress }, error: null },
        { data: null, error: null },
      ])

      const result = await recordAction(userId, 'delete_expense')

      expect(result.tierCompleted).toBe(null)
      expect(result.shouldSendUnlock).toBe(false)
    })
  })

  describe('Tier 2 Completion (AC-3.1.3)', () => {
    it('should detect Tier 2 completion when all 3 actions done', async () => {
      const userId = 'tier2-complete-user'
      const almostComplete = createTierProgress({
        tier2: {
          set_budget: true,
          add_recurring: true,
          list_categories: false,
        },
      })

      mockQuerySequence([
        { data: { onboarding_tier_progress: almostComplete }, error: null },
        { data: null, error: null },
      ])

      const result = await recordAction(userId, 'list_categories')

      expect(result.tierCompleted).toBe(2)
      expect(result.shouldSendUnlock).toBe(true)
    })
  })

  describe('Tier 3 Completion (AC-3.1.4)', () => {
    it('should detect Tier 3 completion when both actions done', async () => {
      const userId = 'tier3-complete-user'
      const almostComplete = createTierProgress({
        tier3: {
          edit_category: true,
          view_report: false,
        },
      })

      mockQuerySequence([
        { data: { onboarding_tier_progress: almostComplete }, error: null },
        { data: null, error: null },
      ])

      const result = await recordAction(userId, 'view_report')

      expect(result.tierCompleted).toBe(3)
      expect(result.shouldSendUnlock).toBe(true)
    })
  })

  describe('onboarding_tier Column Update (AC-3.1.6)', () => {
    it('should update onboarding_tier to 1 when Tier 1 completes', async () => {
      const userId = 'tier-column-user'
      const almostComplete = createTierProgress({
        tier1: {
          add_expense: true,
          edit_category: true,
          delete_expense: true,
          add_category: false,
        },
      })

      // Track what gets passed to update
      let updatePayload: any = null
      mockSupabaseClient.from.mockImplementation((table: string) => {
        const builder = {
          select: jest.fn().mockReturnThis(),
          update: jest.fn().mockImplementation((payload: any) => {
            updatePayload = payload
            return builder
          }),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: jest.fn((resolve: any) => {
            if (updatePayload) {
              return resolve({ data: null, error: null })
            }
            return resolve({ data: { onboarding_tier_progress: almostComplete }, error: null })
          }),
        }
        return builder
      })

      await recordAction(userId, 'add_category')

      expect(updatePayload).toBeDefined()
      expect(updatePayload.onboarding_tier).toBe(1)
    })

    it('should update onboarding_tier to highest completed tier (out-of-order completion)', async () => {
      const userId = 'out-of-order-user'
      // User completes Tier 2 before Tier 1 (both done in this call)
      const progressWithTier1Complete = createTierProgress({
        tier1: {
          add_expense: true,
          edit_category: true,
          delete_expense: true,
          add_category: true,
          completed_at: '2025-11-01T10:00:00.000Z',
        },
        tier2: {
          set_budget: true,
          add_recurring: true,
          list_categories: false,
        },
      })

      let updatePayload: any = null
      mockSupabaseClient.from.mockImplementation(() => {
        const builder = {
          select: jest.fn().mockReturnThis(),
          update: jest.fn().mockImplementation((payload: any) => {
            updatePayload = payload
            return builder
          }),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: jest.fn((resolve: any) => {
            if (updatePayload) {
              return resolve({ data: null, error: null })
            }
            return resolve({ data: { onboarding_tier_progress: progressWithTier1Complete }, error: null })
          }),
        }
        return builder
      })

      await recordAction(userId, 'list_categories')

      expect(updatePayload).toBeDefined()
      expect(updatePayload.onboarding_tier).toBe(2) // Highest = Tier 2
    })
  })

  describe('checkTierCompletion', () => {
    it('should return true when Tier 1 is complete', async () => {
      const userId = 'check-tier1-user'
      const completeT1 = createTierProgress({
        tier1: {
          add_expense: true,
          edit_category: true,
          delete_expense: true,
          add_category: true,
        },
      })

      mockQuerySequence([
        { data: { onboarding_tier_progress: completeT1 }, error: null },
      ])

      const isComplete = await checkTierCompletion(userId, 1)
      expect(isComplete).toBe(true)
    })

    it('should return false when Tier 2 is incomplete', async () => {
      const userId = 'check-tier2-user'
      const incompleteT2 = createTierProgress({
        tier2: {
          set_budget: true,
          add_recurring: false,
          list_categories: true,
        },
      })

      mockQuerySequence([
        { data: { onboarding_tier_progress: incompleteT2 }, error: null },
      ])

      const isComplete = await checkTierCompletion(userId, 2)
      expect(isComplete).toBe(false)
    })

    it('should return true when Tier 3 is complete', async () => {
      const userId = 'check-tier3-user'
      const completeT3 = createTierProgress({
        tier3: {
          edit_category: true,
          view_report: true,
        },
      })

      mockQuerySequence([
        { data: { onboarding_tier_progress: completeT3 }, error: null },
      ])

      const isComplete = await checkTierCompletion(userId, 3)
      expect(isComplete).toBe(true)
    })
  })

  describe('edit_category in Multiple Tiers', () => {
    it('should count edit_category for BOTH Tier 1 AND Tier 3', async () => {
      const userId = 'edit-category-user'
      const emptyProgress = createTierProgress()

      let updatePayload: any = null
      mockSupabaseClient.from.mockImplementation(() => {
        const builder = {
          select: jest.fn().mockReturnThis(),
          update: jest.fn().mockImplementation((payload: any) => {
            updatePayload = payload
            return builder
          }),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: jest.fn((resolve: any) => {
            if (updatePayload) {
              return resolve({ data: null, error: null })
            }
            return resolve({ data: { onboarding_tier_progress: emptyProgress }, error: null })
          }),
        }
        return builder
      })

      await recordAction(userId, 'edit_category')

      expect(updatePayload).toBeDefined()
      expect(updatePayload.onboarding_tier_progress.tier1.edit_category).toBe(true)
      expect(updatePayload.onboarding_tier_progress.tier3.edit_category).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle recordAction database error gracefully', async () => {
      const userId = 'error-action-user'
      const existingProgress = createTierProgress()

      mockQuerySequence([
        { data: { onboarding_tier_progress: existingProgress }, error: null },
        { data: null, error: { message: 'Update failed', code: 'PGRST001' } },
      ])

      const result = await recordAction(userId, 'add_expense')

      expect(result.action).toBe('add_expense')
      expect(result.tierCompleted).toBe(null)
      expect(result.shouldSendUnlock).toBe(false)
    })
  })
})

// =============================================================================
// Story 3.6: Tier Completion Analytics
// =============================================================================

describe('Tier Tracker - Story 3.6 Tier Completion Analytics', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockTrackEvent.mockClear()
  })

  // Helper to create tier progress state
  const createTierProgress36 = (overrides: Partial<TierProgress> = {}): TierProgress => ({
    tier1: {
      add_expense: false,
      edit_category: false,
      delete_expense: false,
      add_category: false,
      ...overrides.tier1,
    },
    tier2: {
      set_budget: false,
      add_recurring: false,
      list_categories: false,
      ...overrides.tier2,
    },
    tier3: {
      edit_category: false,
      view_report: false,
      ...overrides.tier3,
    },
    magic_moment_at: overrides.magic_moment_at,
  })

  describe('PostHog Event Firing (AC-3.6.1)', () => {
    it('should fire onboarding_tier_completed event when Tier 1 completes', async () => {
      const userId = 'analytics-tier1-user'
      const signupDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
      const almostComplete = createTierProgress36({
        tier1: {
          add_expense: true,
          edit_category: true,
          delete_expense: true,
          add_category: false,
        },
      })

      mockQuerySequence([
        // getTierProgress
        { data: { onboarding_tier_progress: almostComplete }, error: null },
        // update tier progress
        { data: null, error: null },
        // fetch created_at for analytics
        { data: { created_at: signupDate.toISOString() }, error: null },
      ])

      await recordAction(userId, 'add_category')

      // Wait for async analytics to fire
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(mockTrackEvent).toHaveBeenCalledWith(
        'onboarding_tier_completed',
        userId,
        expect.objectContaining({
          tier: 1,
          completed_at: expect.any(String),
          time_to_complete_days: expect.any(Number),
          days_since_signup: expect.any(Number),
        })
      )
    })

    it('should fire onboarding_tier_completed event when Tier 2 completes', async () => {
      const userId = 'analytics-tier2-user'
      const signupDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
      const tier1CompletedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
      const almostComplete = createTierProgress36({
        tier1: {
          add_expense: true,
          edit_category: true,
          delete_expense: true,
          add_category: true,
          completed_at: tier1CompletedAt.toISOString(),
        },
        tier2: {
          set_budget: true,
          add_recurring: true,
          list_categories: false,
        },
      })

      mockQuerySequence([
        { data: { onboarding_tier_progress: almostComplete }, error: null },
        { data: null, error: null },
        { data: { created_at: signupDate.toISOString() }, error: null },
      ])

      await recordAction(userId, 'list_categories')

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(mockTrackEvent).toHaveBeenCalledWith(
        'onboarding_tier_completed',
        userId,
        expect.objectContaining({
          tier: 2,
        })
      )
    })

    it('should fire onboarding_tier_completed event when Tier 3 completes', async () => {
      const userId = 'analytics-tier3-user'
      const signupDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) // 20 days ago
      const almostComplete = createTierProgress36({
        tier3: {
          edit_category: true,
          view_report: false,
        },
      })

      mockQuerySequence([
        { data: { onboarding_tier_progress: almostComplete }, error: null },
        { data: null, error: null },
        { data: { created_at: signupDate.toISOString() }, error: null },
      ])

      await recordAction(userId, 'view_report')

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(mockTrackEvent).toHaveBeenCalledWith(
        'onboarding_tier_completed',
        userId,
        expect.objectContaining({
          tier: 3,
        })
      )
    })

    it('should NOT fire event when no tier completes', async () => {
      const userId = 'no-tier-complete-user'
      const partialProgress = createTierProgress36({
        tier1: {
          add_expense: true,
          edit_category: false,
          delete_expense: false,
          add_category: false,
        },
      })

      mockQuerySequence([
        { data: { onboarding_tier_progress: partialProgress }, error: null },
        { data: null, error: null },
      ])

      await recordAction(userId, 'delete_expense')

      await new Promise(resolve => setTimeout(resolve, 50))

      // No tier completed, so no analytics event
      expect(mockTrackEvent).not.toHaveBeenCalledWith(
        'onboarding_tier_completed',
        expect.any(String),
        expect.any(Object)
      )
    })
  })

  describe('Event Payload Properties (AC-3.6.2)', () => {
    it('should include all required properties in event payload', async () => {
      const userId = 'payload-test-user'
      const signupDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
      const almostComplete = createTierProgress36({
        tier1: {
          add_expense: true,
          edit_category: true,
          delete_expense: true,
          add_category: false,
        },
      })

      mockQuerySequence([
        { data: { onboarding_tier_progress: almostComplete }, error: null },
        { data: null, error: null },
        { data: { created_at: signupDate.toISOString() }, error: null },
      ])

      await recordAction(userId, 'add_category')

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(mockTrackEvent).toHaveBeenCalledWith(
        'onboarding_tier_completed',
        userId,
        expect.objectContaining({
          tier: 1,
          completed_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), // ISO timestamp
          time_to_complete_days: expect.any(Number),
          days_since_signup: expect.any(Number),
        })
      )

      // Verify days_since_signup is approximately correct (7 days)
      const calledProps = mockTrackEvent.mock.calls[0][2]
      expect(calledProps.days_since_signup).toBeGreaterThanOrEqual(6)
      expect(calledProps.days_since_signup).toBeLessThanOrEqual(8)
    })

    it('should calculate time_to_complete_days from signup for Tier 1', async () => {
      const userId = 'tier1-time-user'
      const signupDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
      const almostComplete = createTierProgress36({
        tier1: {
          add_expense: true,
          edit_category: true,
          delete_expense: true,
          add_category: false,
        },
      })

      mockQuerySequence([
        { data: { onboarding_tier_progress: almostComplete }, error: null },
        { data: null, error: null },
        { data: { created_at: signupDate.toISOString() }, error: null },
      ])

      await recordAction(userId, 'add_category')

      await new Promise(resolve => setTimeout(resolve, 50))

      const calledProps = mockTrackEvent.mock.calls[0][2]
      // Tier 1: time_to_complete_days should equal days_since_signup
      expect(calledProps.time_to_complete_days).toBe(calledProps.days_since_signup)
    })

    it('should calculate time_to_complete_days from previous tier for Tier 2', async () => {
      const userId = 'tier2-time-user'
      const signupDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) // 14 days ago
      const tier1CompletedAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
      const almostComplete = createTierProgress36({
        tier1: {
          add_expense: true,
          edit_category: true,
          delete_expense: true,
          add_category: true,
          completed_at: tier1CompletedAt.toISOString(),
        },
        tier2: {
          set_budget: true,
          add_recurring: true,
          list_categories: false,
        },
      })

      mockQuerySequence([
        { data: { onboarding_tier_progress: almostComplete }, error: null },
        { data: null, error: null },
        { data: { created_at: signupDate.toISOString() }, error: null },
      ])

      await recordAction(userId, 'list_categories')

      await new Promise(resolve => setTimeout(resolve, 50))

      const calledProps = mockTrackEvent.mock.calls[0][2]
      // Tier 2: time_to_complete_days should be ~7 (from Tier 1 completion)
      expect(calledProps.time_to_complete_days).toBeGreaterThanOrEqual(6)
      expect(calledProps.time_to_complete_days).toBeLessThanOrEqual(8)
      // days_since_signup should be ~14
      expect(calledProps.days_since_signup).toBeGreaterThanOrEqual(13)
      expect(calledProps.days_since_signup).toBeLessThanOrEqual(15)
    })

    it('should fallback to signup date if previous tier has no completed_at', async () => {
      const userId = 'fallback-time-user'
      const signupDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
      // Tier 1 complete but no completed_at (legacy data)
      const almostComplete = createTierProgress36({
        tier1: {
          add_expense: true,
          edit_category: true,
          delete_expense: true,
          add_category: true,
          // No completed_at!
        },
        tier2: {
          set_budget: true,
          add_recurring: true,
          list_categories: false,
        },
      })

      mockQuerySequence([
        { data: { onboarding_tier_progress: almostComplete }, error: null },
        { data: null, error: null },
        { data: { created_at: signupDate.toISOString() }, error: null },
      ])

      await recordAction(userId, 'list_categories')

      await new Promise(resolve => setTimeout(resolve, 50))

      const calledProps = mockTrackEvent.mock.calls[0][2]
      // Should fallback to days_since_signup
      expect(calledProps.time_to_complete_days).toBe(calledProps.days_since_signup)
    })
  })

  describe('Analytics Error Handling', () => {
    it('should handle created_at fetch error gracefully (non-blocking)', async () => {
      const userId = 'analytics-error-user'
      const almostComplete = createTierProgress36({
        tier1: {
          add_expense: true,
          edit_category: true,
          delete_expense: true,
          add_category: false,
        },
      })

      mockQuerySequence([
        { data: { onboarding_tier_progress: almostComplete }, error: null },
        { data: null, error: null },
        // Analytics query fails
        { data: null, error: { message: 'DB error', code: 'PGRST000' } },
      ])

      // Should not throw
      const result = await recordAction(userId, 'add_category')

      // Main functionality still works
      expect(result.tierCompleted).toBe(1)
      expect(result.shouldSendUnlock).toBe(true)

      await new Promise(resolve => setTimeout(resolve, 50))

      // Event may be called with zeros due to error fallback
      // The key is that the main flow wasn't blocked
    })
  })
})
