/**
 * No Hard Gating Policy Tests
 *
 * Story 3.4: No Hard Gating Policy
 *
 * Tests:
 * - AC-3.4.1: Tier 0 user CAN set budget (Tier 2 action) without error
 * - AC-3.4.2: Tier 0 user CAN view report (Tier 3 action) without error
 * - AC-3.4.3: Out-of-order actions still record correctly to their respective tiers
 * - AC-3.4.4: Each tier celebrates independently when complete (regardless of order)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  recordAction,
  getTierProgress,
  type TierProgress,
} from '../../services/onboarding/tier-tracker'
import {
  mockSupabaseClient,
  resetSupabaseMocks,
  mockQuerySequence,
} from '../../__mocks__/supabase'

// Mock the supabase client
jest.mock('../../services/database/supabase-client', () => ({
  getSupabaseClient: () => mockSupabaseClient,
}))

// Mock analytics trackEvent
jest.mock('../../analytics/index', () => ({
  trackEvent: jest.fn(),
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

describe('Story 3.4: No Hard Gating Policy', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    jest.clearAllMocks()
  })

  describe('AC-3.4.1: Tier 0 user CAN set budget (Tier 2 action) without error', () => {
    it('should allow Tier 0 user to record set_budget action', async () => {
      const userId = 'tier0-user-budget'
      // Tier 0 user - completely empty progress
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

      const result = await recordAction(userId, 'set_budget')

      // Should NOT throw error
      expect(result.action).toBe('set_budget')
      // Should record to tier2 progress
      expect(updatePayload.onboarding_tier_progress.tier2.set_budget).toBe(true)
      // Tier NOT complete (missing add_recurring, list_categories)
      expect(result.tierCompleted).toBe(null)
    })

    it('should not require Tier 1 completion before set_budget', async () => {
      const userId = 'tier0-no-prereq'
      // Zero Tier 1 actions completed
      const noTier1Progress = createTierProgress({
        tier1: {
          add_expense: false,
          edit_category: false,
          delete_expense: false,
          add_category: false,
        },
      })

      mockQuerySequence([
        { data: { onboarding_tier_progress: noTier1Progress }, error: null },
        { data: null, error: null },
      ])

      // Should succeed even with zero Tier 1 progress
      const result = await recordAction(userId, 'set_budget')

      expect(result.action).toBe('set_budget')
      // No error thrown - that's the key assertion
    })
  })

  describe('AC-3.4.2: Tier 0 user CAN view report (Tier 3 action) without error', () => {
    it('should allow Tier 0 user to record view_report action', async () => {
      const userId = 'tier0-user-report'
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

      const result = await recordAction(userId, 'view_report')

      expect(result.action).toBe('view_report')
      expect(updatePayload.onboarding_tier_progress.tier3.view_report).toBe(true)
      // Tier NOT complete (missing edit_category)
      expect(result.tierCompleted).toBe(null)
    })

    it('should record Tier 3 action as first ever action', async () => {
      const userId = 'first-action-tier3'
      const emptyProgress = createTierProgress()

      mockQuerySequence([
        { data: { onboarding_tier_progress: emptyProgress }, error: null },
        { data: null, error: null },
      ])

      // User's very first action is a Tier 3 action
      const result = await recordAction(userId, 'view_report')

      expect(result.action).toBe('view_report')
      // Should succeed without requiring ANY Tier 1 or Tier 2 actions
    })
  })

  describe('AC-3.4.3: Out-of-order actions still record correctly to their respective tiers', () => {
    it('should record Tier 2 action to tier2 progress regardless of tier1 status', async () => {
      const userId = 'out-of-order-t2'
      // User has NO Tier 1 actions
      const noTier1Progress = createTierProgress()

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
            return resolve({ data: { onboarding_tier_progress: noTier1Progress }, error: null })
          }),
        }
        return builder
      })

      await recordAction(userId, 'add_recurring')

      // Action recorded in tier2, NOT tier1
      expect(updatePayload.onboarding_tier_progress.tier2.add_recurring).toBe(true)
      expect(updatePayload.onboarding_tier_progress.tier1.add_expense).toBe(false)
    })

    it('should record Tier 3 action to tier3 progress regardless of tier1/2 status', async () => {
      const userId = 'out-of-order-t3'
      const noProgress = createTierProgress()

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
            return resolve({ data: { onboarding_tier_progress: noProgress }, error: null })
          }),
        }
        return builder
      })

      await recordAction(userId, 'view_report')

      expect(updatePayload.onboarding_tier_progress.tier3.view_report).toBe(true)
      // Tier 1 and Tier 2 should remain untouched
      expect(updatePayload.onboarding_tier_progress.tier1.add_expense).toBe(false)
      expect(updatePayload.onboarding_tier_progress.tier2.set_budget).toBe(false)
    })

    it('should handle scenario: Tier 2 action, then Tier 1 actions, then Tier 2 completes', async () => {
      const userId = 'mixed-order-user'

      // Step 1: User does set_budget first (Tier 2 action, no Tier 1 done)
      const step1Progress = createTierProgress()

      let step1Payload: any = null
      mockSupabaseClient.from.mockImplementation(() => {
        const builder = {
          select: jest.fn().mockReturnThis(),
          update: jest.fn().mockImplementation((payload: any) => {
            step1Payload = payload
            return builder
          }),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: jest.fn((resolve: any) => {
            if (step1Payload) {
              return resolve({ data: null, error: null })
            }
            return resolve({ data: { onboarding_tier_progress: step1Progress }, error: null })
          }),
        }
        return builder
      })

      const result1 = await recordAction(userId, 'set_budget')

      expect(result1.tierCompleted).toBe(null) // Tier 2 not complete yet
      expect(step1Payload.onboarding_tier_progress.tier2.set_budget).toBe(true)

      // Step 2: User continues with Tier 2 actions until complete
      const step2Progress = createTierProgress({
        tier2: {
          set_budget: true,
          add_recurring: true,
          list_categories: false,
        },
      })

      let step2Payload: any = null
      mockSupabaseClient.from.mockImplementation(() => {
        const builder = {
          select: jest.fn().mockReturnThis(),
          update: jest.fn().mockImplementation((payload: any) => {
            step2Payload = payload
            return builder
          }),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: jest.fn((resolve: any) => {
            if (step2Payload) {
              return resolve({ data: null, error: null })
            }
            return resolve({ data: { onboarding_tier_progress: step2Progress }, error: null })
          }),
        }
        return builder
      })

      const result2 = await recordAction(userId, 'list_categories')

      expect(result2.tierCompleted).toBe(2) // Tier 2 completes
      expect(result2.shouldSendUnlock).toBe(true) // Should celebrate
      // Even though Tier 1 is NOT complete!
      expect(step2Payload.onboarding_tier_progress.tier1.add_expense).toBe(false)
    })
  })

  describe('AC-3.4.4: Each tier celebrates independently when complete (regardless of order)', () => {
    it('should celebrate Tier 2 completion even when Tier 1 is incomplete', async () => {
      const userId = 't2-before-t1'
      // Has all but one Tier 2 action, zero Tier 1 actions
      const almostT2Complete = createTierProgress({
        tier1: {
          add_expense: false,
          edit_category: false,
          delete_expense: false,
          add_category: false,
        },
        tier2: {
          set_budget: true,
          add_recurring: true,
          list_categories: false,
        },
      })

      mockQuerySequence([
        { data: { onboarding_tier_progress: almostT2Complete }, error: null },
        { data: null, error: null },
      ])

      const result = await recordAction(userId, 'list_categories')

      expect(result.tierCompleted).toBe(2)
      expect(result.shouldSendUnlock).toBe(true)
      // onboarding_tier should be 2 (highest completed)
    })

    it('should celebrate Tier 1 after Tier 2 is already complete', async () => {
      const userId = 't1-after-t2'
      // Tier 2 complete, Tier 1 almost complete
      const t2CompleteT1Almost = createTierProgress({
        tier1: {
          add_expense: true,
          edit_category: true,
          delete_expense: true,
          add_category: false, // Missing one
        },
        tier2: {
          set_budget: true,
          add_recurring: true,
          list_categories: true,
          completed_at: '2025-11-20T10:00:00.000Z',
        },
      })

      mockQuerySequence([
        { data: { onboarding_tier_progress: t2CompleteT1Almost }, error: null },
        { data: null, error: null },
      ])

      const result = await recordAction(userId, 'add_category')

      expect(result.tierCompleted).toBe(1)
      expect(result.shouldSendUnlock).toBe(true)
      // Tier 1 celebration should fire even though Tier 2 is already done
    })

    it('should set independent completed_at timestamps for each tier', async () => {
      const userId = 'independent-timestamps'
      // Tier 2 complete with timestamp, Tier 1 about to complete
      const t2Complete = createTierProgress({
        tier1: {
          add_expense: true,
          edit_category: true,
          delete_expense: true,
          add_category: false,
        },
        tier2: {
          set_budget: true,
          add_recurring: true,
          list_categories: true,
          completed_at: '2025-11-20T10:00:00.000Z', // Already has timestamp
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
            return resolve({ data: { onboarding_tier_progress: t2Complete }, error: null })
          }),
        }
        return builder
      })

      await recordAction(userId, 'add_category')

      // Tier 1 should now have its own completed_at
      expect(updatePayload.onboarding_tier_progress.tier1.completed_at).toBeDefined()
      // Tier 2 timestamp should remain unchanged
      expect(updatePayload.onboarding_tier_progress.tier2.completed_at).toBe('2025-11-20T10:00:00.000Z')
    })

    it('should NOT re-celebrate an already completed tier', async () => {
      const userId = 'no-double-celebration'
      // Tier 1 already complete with timestamp
      const t1AlreadyComplete = createTierProgress({
        tier1: {
          add_expense: true,
          edit_category: true,
          delete_expense: true,
          add_category: true,
          completed_at: '2025-11-19T10:00:00.000Z',
        },
      })

      mockQuerySequence([
        { data: { onboarding_tier_progress: t1AlreadyComplete }, error: null },
        { data: null, error: null },
      ])

      // Record same action again
      const result = await recordAction(userId, 'add_expense')

      // Should NOT trigger celebration again
      expect(result.tierCompleted).toBe(null)
      expect(result.shouldSendUnlock).toBe(false)
    })
  })

  describe('Integration: Full out-of-order journey', () => {
    it('should handle complete reverse order: T3 → T2 → T1 completion', async () => {
      const userId = 'reverse-order-journey'

      // Step 1: Complete Tier 3 first
      const t3AlmostComplete = createTierProgress({
        tier3: { edit_category: true, view_report: false },
      })

      let payload1: any = null
      mockSupabaseClient.from.mockImplementation(() => {
        const builder = {
          select: jest.fn().mockReturnThis(),
          update: jest.fn().mockImplementation((p: any) => { payload1 = p; return builder }),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: jest.fn((r: any) => payload1 ? r({ data: null, error: null }) : r({ data: { onboarding_tier_progress: t3AlmostComplete }, error: null })),
        }
        return builder
      })

      const result1 = await recordAction(userId, 'view_report')
      expect(result1.tierCompleted).toBe(3)
      expect(payload1.onboarding_tier).toBe(3) // Highest = Tier 3

      // Step 2: Complete Tier 2 second
      const t3CompleteT2Almost = createTierProgress({
        tier2: { set_budget: true, add_recurring: true, list_categories: false },
        tier3: { edit_category: true, view_report: true, completed_at: '2025-11-20T10:00:00.000Z' },
      })

      let payload2: any = null
      mockSupabaseClient.from.mockImplementation(() => {
        const builder = {
          select: jest.fn().mockReturnThis(),
          update: jest.fn().mockImplementation((p: any) => { payload2 = p; return builder }),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: jest.fn((r: any) => payload2 ? r({ data: null, error: null }) : r({ data: { onboarding_tier_progress: t3CompleteT2Almost }, error: null })),
        }
        return builder
      })

      const result2 = await recordAction(userId, 'list_categories')
      expect(result2.tierCompleted).toBe(2)
      expect(payload2.onboarding_tier).toBe(3) // Still Tier 3 (highest)

      // Step 3: Complete Tier 1 last
      const t3t2CompleteT1Almost = createTierProgress({
        tier1: { add_expense: true, edit_category: true, delete_expense: true, add_category: false },
        tier2: { set_budget: true, add_recurring: true, list_categories: true, completed_at: '2025-11-20T11:00:00.000Z' },
        tier3: { edit_category: true, view_report: true, completed_at: '2025-11-20T10:00:00.000Z' },
      })

      let payload3: any = null
      mockSupabaseClient.from.mockImplementation(() => {
        const builder = {
          select: jest.fn().mockReturnThis(),
          update: jest.fn().mockImplementation((p: any) => { payload3 = p; return builder }),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: jest.fn((r: any) => payload3 ? r({ data: null, error: null }) : r({ data: { onboarding_tier_progress: t3t2CompleteT1Almost }, error: null })),
        }
        return builder
      })

      const result3 = await recordAction(userId, 'add_category')
      expect(result3.tierCompleted).toBe(1)
      expect(result3.shouldSendUnlock).toBe(true) // Celebrate Tier 1!
      expect(payload3.onboarding_tier).toBe(3) // Still Tier 3 (highest)
    })
  })
})
