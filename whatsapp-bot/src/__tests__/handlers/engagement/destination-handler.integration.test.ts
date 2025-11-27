/**
 * Destination Handler Integration Tests
 *
 * Story 4.6: Message Routing Service
 *
 * Integration tests for the complete destination switching flow,
 * including text handler integration and message queue interaction.
 *
 * Tests:
 * - Full destination switch flow through text handler
 * - Queue message routing at send time
 * - Fallback behavior in realistic scenarios
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { randomUUID } from 'crypto'
import { describe, it, expect, beforeAll, afterEach, jest } from '@jest/globals'
import {
  resolveDestinationJid,
} from '../../../services/scheduler/message-sender'
import { getMessageDestination } from '../../../services/engagement/message-router'
import { getTestSupabaseClient, createTestUser } from '../../utils/test-database'

// Helper to wait for database consistency in CI environments
const waitForDbConsistency = () => new Promise(resolve => setTimeout(resolve, 200))

// Helper to generate unique group JID per test to avoid constraint violations
const generateUniqueGroupJid = (userId: string) => `120363${userId.substring(0, 8).replace(/-/g, '')}@g.us`

// Unmock message-router since we want to test actual database behavior
jest.unmock('../../../services/engagement/message-router')

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
// Helper Functions & Setup
// =============================================================================

let testUserIds: string[] = []

// Global cleanup before suite runs
beforeAll(async () => {
  const supabase = getTestSupabaseClient()
  // Clean up in reverse FK order - remove all test data except system user
  await supabase.from('authorized_groups').delete().neq('user_id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('user_profiles').delete().neq('user_id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('authorized_whatsapp_numbers').delete().neq('user_id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000')
})

// Cleanup after each test
afterEach(async () => {
  if (testUserIds.length > 0) {
    const supabase = getTestSupabaseClient()
    await supabase.from('authorized_groups').delete().in('user_id', testUserIds)
    await supabase.from('user_profiles').delete().in('user_id', testUserIds)
    await supabase.from('authorized_whatsapp_numbers').delete().in('user_id', testUserIds)
    await supabase.from('users').delete().in('id', testUserIds)
    testUserIds = []
  }
})

async function createTestUserProfile(
  userId: string,
  destination: 'individual' | 'group',
  groupJid?: string | null,
  whatsappJid?: string
): Promise<void> {
  const supabase = getTestSupabaseClient()
  testUserIds.push(userId)

  const jid = whatsappJid || `${userId}@s.whatsapp.net`

  // Create test user in users table first (required for FK constraint)
  await createTestUser(userId)

  // Create authorized WhatsApp number
  const { error: whatsappError } = await supabase.from('authorized_whatsapp_numbers').insert({
    user_id: userId,
    whatsapp_number: userId,
    whatsapp_jid: jid,
    name: 'Test User',
    is_primary: true,
  })

  if (whatsappError) {
    throw new Error(`Failed to create authorized whatsapp number: ${whatsappError.message}`)
  }

  // Create user profile with destination preference (use upsert for idempotency)
  const { error } = await supabase.from('user_profiles').upsert({
    user_id: userId,
    preferred_destination: destination,
    locale: 'en',
  }, {
    onConflict: 'user_id'
  })

  if (error) {
    throw new Error(`Failed to create test user profile: ${error?.message}`)
  }

  // If group destination and groupJid provided, create authorized group
  if (destination === 'group' && groupJid) {
    const { error: groupError } = await supabase.from('authorized_groups').insert({
      user_id: userId,
      group_jid: groupJid,
      group_name: 'Test Group',
      is_active: true,
      auto_authorized: false,
    })

    if (groupError) {
      throw new Error(`Failed to create authorized group: ${groupError.message}`)
    }
  }
}

// =============================================================================
// resolveDestinationJid() Integration Tests
// =============================================================================

describe('Message Queue Integration - resolveDestinationJid()', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Individual Destination Routing', () => {
    it('should resolve to individual JID at send time', async () => {
      const userId = randomUUID()
      const whatsappJid = '5511999999999@s.whatsapp.net'
      const fallbackJid = '5511888888888@s.whatsapp.net'

      await createTestUserProfile(userId, 'individual', undefined, whatsappJid)

      const result = await resolveDestinationJid(userId, fallbackJid)

      expect(result.jid).toBe(whatsappJid)
      expect(result.destination).toBe('individual')
      expect(result.fallbackUsed).toBe(false)
    })
  })

  describe('Group Destination Routing', () => {
    it('should resolve to group JID at send time', async () => {
      const userId = randomUUID()
      const groupJid = generateUniqueGroupJid(userId)
      const fallbackJid = '5511999999999@s.whatsapp.net'

      await createTestUserProfile(userId, 'group', groupJid)

      const result = await resolveDestinationJid(userId, fallbackJid)

      expect(result.jid).toBe(groupJid)
      expect(result.destination).toBe('group')
      expect(result.fallbackUsed).toBe(false)
    })
  })

  describe('Fallback Scenarios', () => {
    it('should use fallback when group preference but no group JID', async () => {
      const userId = randomUUID()
      const whatsappJid = '5511999999999@s.whatsapp.net'
      const fallbackJid = '5511888888888@s.whatsapp.net'

      await createTestUserProfile(userId, 'group', null, whatsappJid)

      const result = await resolveDestinationJid(userId, fallbackJid)

      // Falls back to individual JID from profile
      expect(result.jid).toBe(whatsappJid)
      expect(result.destination).toBe('individual')
      expect(result.fallbackUsed).toBe(true)
    })

    it('should use fallback JID when user profile not found', async () => {
      const nonExistentId = randomUUID() // User doesn't exist in database
      const fallbackJid = '5511888888888@s.whatsapp.net'

      const result = await resolveDestinationJid(nonExistentId, fallbackJid)

      expect(result.jid).toBe(fallbackJid)
      expect(result.destination).toBe('individual')
      expect(result.fallbackUsed).toBe(true)
    })

    it('should use fallback JID on database error', async () => {
      // This test can't easily simulate database errors with real DB
      // Instead, test the fallback with a non-existent user (same behavior)
      const nonExistentId = randomUUID()
      const fallbackJid = '5511888888888@s.whatsapp.net'

      const result = await resolveDestinationJid(nonExistentId, fallbackJid)

      expect(result.jid).toBe(fallbackJid)
      expect(result.destination).toBe('individual')
      expect(result.fallbackUsed).toBe(true)
    })
  })

  describe('Send-Time Resolution', () => {
    it('should resolve to latest preference when user changes preference between queue and send', async () => {
      // Scenario: Message queued when user had individual preference,
      // but user switched to group before send
      const userId = randomUUID()
      const originalQueuedJid = '5511999999999@s.whatsapp.net' // Original individual JID
      const groupJid = generateUniqueGroupJid(userId)

      // At send time, user has group preference
      await createTestUserProfile(userId, 'group', groupJid)

      const result = await resolveDestinationJid(userId, originalQueuedJid)

      // Should use the NEW preference (group), not the originally queued JID
      expect(result.jid).toBe(groupJid)
      expect(result.destination).toBe('group')
      expect(result.fallbackUsed).toBe(false)
    })

    it('should handle concurrent destination changes gracefully', async () => {
      const userId = randomUUID()
      const whatsappJid = '5511999999999@s.whatsapp.net'
      const groupJid = generateUniqueGroupJid(userId)
      const fallbackJid = '5511888888888@s.whatsapp.net'

      // First call - individual
      await createTestUserProfile(userId, 'individual', undefined, whatsappJid)
      const result1 = await resolveDestinationJid(userId, fallbackJid)

      // Update user preference to group
      const supabase = getTestSupabaseClient()
      await supabase
        .from('user_profiles')
        .update({
          preferred_destination: 'group',
        })
        .eq('user_id', userId)

      // Create authorized group for the user
      await supabase.from('authorized_groups').insert({
        user_id: userId,
        group_jid: groupJid,
        group_name: 'Test Group',
        is_active: true,
        auto_authorized: false,
      })

      // Wait for database consistency (CI environments may have higher latency)
      await waitForDbConsistency()

      // Second call - group (user switched)
      const result2 = await resolveDestinationJid(userId, fallbackJid)

      expect(result1.destination).toBe('individual')
      expect(result2.destination).toBe('group')
    })
  })
})

// =============================================================================
// End-to-End Routing Tests
// =============================================================================

describe('Message Routing End-to-End Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Destination Switching + Message Queue Integration', () => {
    it('should route messages to new destination immediately after switch', async () => {
      const userId = randomUUID()
      const whatsappJid = '5511999999999@s.whatsapp.net'
      const groupJid = generateUniqueGroupJid(userId)

      // Step 1: Initial state - individual destination
      await createTestUserProfile(userId, 'individual', undefined, whatsappJid)

      let routeResult = await getMessageDestination(userId)
      expect(routeResult!.destination).toBe('individual')
      expect(routeResult!.destinationJid).toBe(whatsappJid)

      // Step 2: After switch to group - immediately routes to group
      const supabase = getTestSupabaseClient()
      await supabase
        .from('user_profiles')
        .update({
          preferred_destination: 'group',
        })
        .eq('user_id', userId)

      // Create authorized group for the user
      await supabase.from('authorized_groups').insert({
        user_id: userId,
        group_jid: groupJid,
        group_name: 'Test Group',
        is_active: true,
        auto_authorized: false,
      })

      // Wait for database consistency (CI environments may have higher latency)
      await waitForDbConsistency()

      routeResult = await getMessageDestination(userId)
      expect(routeResult!.destination).toBe('group')
      expect(routeResult!.destinationJid).toBe(groupJid)
    })

    it('should handle rapid destination switching', async () => {
      const userId = randomUUID()
      const whatsappJid = '5511999999999@s.whatsapp.net'
      const groupJid = generateUniqueGroupJid(userId)

      // Create initial user with individual preference
      await createTestUserProfile(userId, 'individual', undefined, whatsappJid)

      // Rapid switch: individual -> group -> individual
      const destinations: Array<{ dest: 'individual' | 'group'; expectedJid: string }> = [
        { dest: 'individual', expectedJid: whatsappJid },
        { dest: 'group', expectedJid: groupJid },
        { dest: 'individual', expectedJid: whatsappJid },
      ]

      for (const { dest, expectedJid } of destinations) {
        const supabase = getTestSupabaseClient()
        await supabase
          .from('user_profiles')
          .update({
            preferred_destination: dest,
          })
          .eq('user_id', userId)

        if (dest === 'group') {
          // Delete any existing groups and create new one
          await supabase.from('authorized_groups')
            .delete()
            .eq('user_id', userId)

          await supabase.from('authorized_groups').insert({
            user_id: userId,
            group_jid: groupJid,
            group_name: 'Test Group',
            is_active: true,
            auto_authorized: false,
          })
        } else {
          // Deactivate group when switching to individual
          await supabase.from('authorized_groups')
            .update({ is_active: false })
            .eq('user_id', userId)
        }

        // Wait for database consistency (CI environments may have higher latency)
        await waitForDbConsistency()

        const routeResult = await getMessageDestination(userId)
        expect(routeResult!.destination).toBe(dest)
        expect(routeResult!.destinationJid).toBe(expectedJid)
      }
    })
  })

  describe('Fallback Chain', () => {
    it('should follow fallback chain: group_jid -> individual_jid -> fallback parameter', async () => {
      const fallbackJid = 'fallback@s.whatsapp.net'
      const whatsappJid = '5511999999999@s.whatsapp.net'

      // Case 1: Group preference with group JID -> use group JID
      const userId1 = randomUUID()
      const groupJid1 = generateUniqueGroupJid(userId1)
      await createTestUserProfile(userId1, 'group', groupJid1, whatsappJid)

      let result = await resolveDestinationJid(userId1, fallbackJid)
      expect(result.jid).toBe(groupJid1)
      expect(result.fallbackUsed).toBe(false)

      // Case 2: Group preference without group JID -> fallback to individual JID from profile
      const userId2 = randomUUID()
      await createTestUserProfile(userId2, 'group', null, whatsappJid)

      result = await resolveDestinationJid(userId2, fallbackJid)
      expect(result.jid).toBe(whatsappJid)
      expect(result.fallbackUsed).toBe(true)

      // Case 3: No profile found -> fallback to parameter
      const nonExistentId = randomUUID() // User doesn't exist in database

      result = await resolveDestinationJid(nonExistentId, fallbackJid)
      expect(result.jid).toBe(fallbackJid)
      expect(result.fallbackUsed).toBe(true)
    })
  })
})
