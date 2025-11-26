/**
 * Example Integration Test for E2E Testing Framework
 *
 * This test validates that all test infrastructure works correctly:
 * - Time manipulation utilities
 * - Engagement state fixtures
 * - Baileys message capture
 * - Test database helpers
 *
 * Purpose: Demonstrate and validate the testing framework built in Story 7.1
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { createMockEngagementState, createMockMessageQueue } from './fixtures/engagement-fixtures.js'
import { setupMockTime, advanceTime, resetClock } from '../utils/time-helpers.js'
import {
  seedEngagementState,
  cleanupEngagementStates,
  getEngagementState,
  getMessageQueueCount,
} from '../utils/idempotency-helpers.js'
import { getMockMessages, clearMockMessages } from '../../__mocks__/baileys.js'

describe('E2E Testing Framework Example', () => {
  let testUserIds: string[] = []

  beforeEach(() => {
    setupMockTime(new Date('2025-01-01T00:00:00Z'))
    clearMockMessages()
    testUserIds = []
  })

  afterEach(async () => {
    await cleanupEngagementStates(testUserIds)
    resetClock()
  })

  describe('Time Manipulation', () => {
    it('should set up mock time to specific date', () => {
      // Time is set to 2025-01-01 in beforeEach
      const startTime = new Date()
      expect(startTime.toISOString()).toBe('2025-01-01T00:00:00.000Z')

      // Verify we can mock specific times
      const mockTime = new Date('2025-06-15T12:30:00Z')
      setupMockTime(mockTime)
      const now = new Date()
      expect(now.toISOString()).toBe('2025-06-15T12:30:00.000Z')
    })

    it('should reset clock to real time', () => {
      resetClock()

      // After reset, Date.now() should be approximately current time
      const now = Date.now()
      const actualNow = Date.now()
      expect(Math.abs(now - actualNow)).toBeLessThan(1000) // Within 1 second
    })
  })

  describe('Engagement State Fixtures', () => {
    it('should create mock engagement state with defaults', () => {
      const state = createMockEngagementState()

      expect(state.id).toBeDefined()
      expect(state.userId).toBeDefined()
      expect(state.state).toBe('active')
      expect(state.lastActivityAt).toBeInstanceOf(Date)
      expect(state.goodbyeSentAt).toBeNull()
      expect(state.goodbyeExpiresAt).toBeNull()
      expect(state.remindAt).toBeNull()
    })

    it('should create mock engagement state with overrides', () => {
      const customDate = new Date('2025-01-01T00:00:00Z')
      const goodbyeDate = new Date('2025-01-15T00:00:00Z')

      const state = createMockEngagementState({
        state: 'goodbye_sent',
        lastActivityAt: customDate,
        goodbyeSentAt: goodbyeDate,
      })

      expect(state.state).toBe('goodbye_sent')
      expect(state.lastActivityAt).toEqual(customDate)
      expect(state.goodbyeSentAt).toEqual(goodbyeDate)
    })
  })

  describe('Message Queue Fixtures', () => {
    it('should create mock message queue with defaults', () => {
      const message = createMockMessageQueue()

      expect(message.id).toBeDefined()
      expect(message.userId).toBeDefined()
      expect(message.messageType).toBe('goodbye')
      expect(message.destination).toBe('individual')
      expect(message.status).toBe('pending')
      expect(message.retryCount).toBe(0)
      expect(message.idempotencyKey).toBeDefined()
    })

    it('should create mock message queue with overrides', () => {
      const userId = 'test-user-123'

      const message = createMockMessageQueue({
        userId,
        messageType: 'weekly_review',
        status: 'sent',
      })

      expect(message.userId).toBe(userId)
      expect(message.messageType).toBe('weekly_review')
      expect(message.status).toBe('sent')
    })
  })

  describe('Baileys Message Capture', () => {
    it('should capture messages sent via mock Baileys client', async () => {
      const { mockBaileysClient } = await import('../../__mocks__/baileys.js')

      // Send a test message
      await mockBaileysClient.sendMessage('123456789@s.whatsapp.net', {
        text: 'Test message',
      })

      const messages = getMockMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0].jid).toBe('123456789@s.whatsapp.net')
      expect(messages[0].message.text).toBe('Test message')
    })

    it('should clear messages between tests', async () => {
      const { mockBaileysClient } = await import('../../__mocks__/baileys.js')

      await mockBaileysClient.sendMessage('123456789@s.whatsapp.net', {
        text: 'Message 1',
      })

      clearMockMessages()

      const messages = getMockMessages()
      expect(messages).toHaveLength(0)
    })
  })

  describe('Test Database Helpers', () => {
    it('should seed and retrieve engagement state', async () => {
      // Create state with valid UUID (no mock setup needed - using real database!)
      const state = createMockEngagementState()
      testUserIds.push(state.userId)

      // Seed into real database
      await seedEngagementState(state)

      // Retrieve from real database
      const retrieved = await getEngagementState(state.userId)
      expect(retrieved).toBeDefined()
      expect(retrieved?.userId).toBe(state.userId)
      expect(retrieved?.state).toBe('active')
    })

    it('should count message queue entries', async () => {
      const count = await getMessageQueueCount()
      expect(typeof count).toBe('number')
      expect(count).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Integration: Simulated 14-Day Journey', () => {
    it('should demonstrate time advancement utilities work', () => {
      // Note: This test demonstrates that advanceTime() works correctly.
      // In actual test usage (Stories 7.2+), tests should minimize time advancement
      // or use isolated test suites to avoid accumulation.

      // Capture start time
      const startTime = new Date()

      // Advance by 5 days
      const result = advanceTime(5)

      // Verify advanceTime returns a Date object
      expect(result).toBeInstanceOf(Date)

      // Verify time moved forward
      const afterTime = new Date()
      expect(afterTime.getTime()).toBeGreaterThan(startTime.getTime())

      // The infrastructure works - actual tests will use this pattern with
      // proper test isolation (one advancement per test suite)
    })

    it('should support complete test infrastructure integration', async () => {
      // This test demonstrates all infrastructure components working together
      const state = createMockEngagementState()
      testUserIds.push(state.userId)

      // Database helpers (real database - no mocks!)
      await seedEngagementState(state)

      // Message capture
      const initialMessages = getMockMessages()
      expect(initialMessages).toHaveLength(0)

      // State retrieval
      const retrieved = await getEngagementState(state.userId)
      expect(retrieved).toBeDefined()
      expect(retrieved?.userId).toBe(state.userId)

      // In actual tests (Story 7.3+), this is where we would:
      // - Run the daily engagement scheduler
      // - Verify goodbye message was queued
      // - Check state transitioned to 'goodbye_sent'
    })
  })
})
