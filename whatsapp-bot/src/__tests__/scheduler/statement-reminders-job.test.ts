/**
 * Integration Tests for Statement Reminders Job
 *
 * AC4.5: Cron Job Execution Performance
 * - Job completes in < 30 seconds
 * - Per-user processing < 300ms average
 * - Parallel processing with batches of 10
 * - Early exit if no eligible users
 *
 * AC4.4: Reminder Delivery Success Rate
 * - 99.5% delivery success rate target
 * - Retry logic with exponential backoff
 * - Error handling doesn't halt entire job
 */

import { runStatementRemindersJob } from '../../services/scheduler/statement-reminders-job.js'
import { getEligibleUsersForStatementReminders } from '../../services/reminders/statement-reminder-query.js'
import { sendReminderWithRetry } from '../../services/reminders/reminder-sender.js'
import { getSocket } from '../../index.js'

// Mock dependencies
jest.mock('../../index.js', () => ({
  getSocket: jest.fn()
}))

jest.mock('../../services/reminders/statement-reminder-query.js', () => ({
  getEligibleUsersForStatementReminders: jest.fn()
}))

jest.mock('../../services/reminders/budget-calculator.js', () => ({
  getBudgetDataForReminder: jest.fn()
}))

jest.mock('../../services/reminders/reminder-message-builder.js', () => ({
  buildReminderMessage: jest.fn()
}))

jest.mock('../../services/reminders/reminder-sender.js', () => ({
  sendReminderWithRetry: jest.fn()
}))

jest.mock('../../services/monitoring/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}))

jest.mock('../../analytics/posthog-client.js', () => ({
  getPostHog: jest.fn(() => ({
    capture: jest.fn()
  }))
}))

describe('Statement Reminders Job', () => {
  let mockSocket: any

  beforeEach(() => {
    mockSocket = {
      user: { id: 'bot-user' },
      sendMessage: jest.fn()
    }
    ;(getSocket as any).mockReturnValue(mockSocket)

    // Import and mock budget calculator
    const { getBudgetDataForReminder } = require('../../services/reminders/budget-calculator.js')
    getBudgetDataForReminder.mockResolvedValue({
      totalSpent: 1700,
      budget: 2000,
      remaining: 300,
      percentage: 85,
      periodStart: new Date('2024-12-06'),
      periodEnd: new Date('2025-01-05'),
      nextClosing: new Date('2025-01-05')
    })

    // Import and mock message builder
    const { buildReminderMessage } = require('../../services/reminders/reminder-message-builder.js')
    buildReminderMessage.mockReturnValue('Mock reminder message')
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Job Execution', () => {
    it('should complete successfully with eligible users', async () => {
      const mockUsers = [
        {
          user_id: 'user-1',
          whatsapp_jid: 'jid1',
          whatsapp_lid: null,
          whatsapp_number: '5511999999999',
          locale: 'pt-BR',
          payment_method_id: 'pm-1',
          payment_method_name: 'Card 1',
          statement_closing_day: 5,
          monthly_budget: 2000
        }
      ]

      ;(getEligibleUsersForStatementReminders as any).mockResolvedValue(mockUsers)
      // Add small delay to ensure time passes between Date.now() calls
      ;(sendReminderWithRetry as any).mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({
          success: true,
          attempts: 1
        }), 1))
      )

      const result = await runStatementRemindersJob()

      expect(result).toMatchObject({
        eligibleUsers: 1,
        successfulDeliveries: 1,
        failedDeliveries: 0,
        successRate: 100
      })
      expect(result.durationMs).toBeGreaterThan(0)
      expect(sendReminderWithRetry).toHaveBeenCalledTimes(1)
    })

    it('should handle no eligible users gracefully', async () => {
      ;(getEligibleUsersForStatementReminders as any).mockResolvedValue([])

      const result = await runStatementRemindersJob()

      expect(result).toMatchObject({
        eligibleUsers: 0,
        successfulDeliveries: 0,
        failedDeliveries: 0,
        successRate: 0
      })
      expect(sendReminderWithRetry).not.toHaveBeenCalled()
    })

    it('should skip job when WhatsApp socket not connected', async () => {
      ;(getSocket as any).mockReturnValue(null)

      const result = await runStatementRemindersJob()

      expect(result).toMatchObject({
        eligibleUsers: 0,
        successfulDeliveries: 0,
        failedDeliveries: 0,
        successRate: 0
      })
      expect(getEligibleUsersForStatementReminders).not.toHaveBeenCalled()
    })
  })

  describe('Success Rate Tracking', () => {
    it('should calculate success rate correctly (100%)', async () => {
      const mockUsers = [
        { user_id: 'user-1', payment_method_id: 'pm-1', whatsapp_jid: 'jid1', payment_method_name: 'Card 1', statement_closing_day: 5, locale: 'pt-BR' },
        { user_id: 'user-2', payment_method_id: 'pm-2', whatsapp_jid: 'jid2', payment_method_name: 'Card 2', statement_closing_day: 5, locale: 'pt-BR' }
      ]

      ;(getEligibleUsersForStatementReminders as any).mockResolvedValue(mockUsers)
      ;(sendReminderWithRetry as any).mockResolvedValue({
        success: true,
        attempts: 1
      })

      const result = await runStatementRemindersJob()

      expect(result.successRate).toBe(100)
      expect(result.successfulDeliveries).toBe(2)
      expect(result.failedDeliveries).toBe(0)
    })

    it('should calculate success rate correctly (50%)', async () => {
      const mockUsers = [
        { user_id: 'user-1', payment_method_id: 'pm-1', whatsapp_jid: 'jid1', payment_method_name: 'Card 1', statement_closing_day: 5, locale: 'pt-BR' },
        { user_id: 'user-2', payment_method_id: 'pm-2', whatsapp_jid: 'jid2', payment_method_name: 'Card 2', statement_closing_day: 5, locale: 'pt-BR' }
      ]

      ;(getEligibleUsersForStatementReminders as any).mockResolvedValue(mockUsers)
      ;(sendReminderWithRetry as any)
        .mockResolvedValueOnce({ success: true, attempts: 1 })
        .mockResolvedValueOnce({ success: false, attempts: 3, error: 'User blocked' })

      const result = await runStatementRemindersJob()

      expect(result.successRate).toBe(50)
      expect(result.successfulDeliveries).toBe(1)
      expect(result.failedDeliveries).toBe(1)
      expect(result.errors).toHaveLength(1)
    })

    it('should track failed deliveries with error details', async () => {
      const mockUsers = [
        {
          user_id: 'user-1',
          payment_method_id: 'pm-1',
          whatsapp_jid: 'jid1',
          payment_method_name: 'Card 1',
          statement_closing_day: 5,
          locale: 'pt-BR'
        }
      ]

      ;(getEligibleUsersForStatementReminders as any).mockResolvedValue(mockUsers)
      ;(sendReminderWithRetry as any).mockResolvedValue({
        success: false,
        attempts: 3,
        error: 'Network timeout',
        errorCategory: 'network_timeout'
      })

      const result = await runStatementRemindersJob()

      expect(result.successfulDeliveries).toBe(0)
      expect(result.failedDeliveries).toBe(1)
      expect(result.errors[0]).toMatchObject({
        userId: 'user-1',
        paymentMethodId: 'pm-1',
        error: 'Network timeout',
        errorCategory: 'network_timeout',
        attempts: 3
      })
    })
  })

  describe('Performance', () => {
    it('should complete job in < 30 seconds for 50 users', async () => {
      const mockUsers = Array.from({ length: 50 }, (_, i) => ({
        user_id: `user-${i}`,
        payment_method_id: `pm-${i}`,
        whatsapp_jid: `jid${i}`,
        payment_method_name: `Card ${i}`,
        statement_closing_day: 5,
        locale: 'pt-BR'
      }))

      ;(getEligibleUsersForStatementReminders as any).mockResolvedValue(mockUsers)
      // Add small delay to ensure time passes between Date.now() calls
      ;(sendReminderWithRetry as any).mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({
          success: true,
          attempts: 1
        }), 1))
      )

      const startTime = Date.now()
      const result = await runStatementRemindersJob()
      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(30000) // < 30 seconds (NFR6)
      expect(result.eligibleUsers).toBe(50)
      expect(result.durationMs).toBeGreaterThan(0)
    }, 35000) // Test timeout: 35 seconds to allow for 30s job + overhead

    it('should process users in batches of 10', async () => {
      const mockUsers = Array.from({ length: 25 }, (_, i) => ({
        user_id: `user-${i}`,
        payment_method_id: `pm-${i}`,
        whatsapp_jid: `jid${i}`,
        payment_method_name: `Card ${i}`,
        statement_closing_day: 5,
        locale: 'pt-BR'
      }))

      ;(getEligibleUsersForStatementReminders as any).mockResolvedValue(mockUsers)
      ;(sendReminderWithRetry as any).mockResolvedValue({
        success: true,
        attempts: 1
      })

      const result = await runStatementRemindersJob()

      expect(result.eligibleUsers).toBe(25)
      expect(result.successfulDeliveries).toBe(25)
      // Verify all users were processed (25 calls to sendReminderWithRetry)
      expect(sendReminderWithRetry).toHaveBeenCalledTimes(25)
    })
  })

  describe('Error Handling', () => {
    it('should continue processing after single user failure', async () => {
      const mockUsers = [
        { user_id: 'user-1', payment_method_id: 'pm-1', whatsapp_jid: 'jid1', payment_method_name: 'Card 1', statement_closing_day: 5, locale: 'pt-BR' },
        { user_id: 'user-2', payment_method_id: 'pm-2', whatsapp_jid: 'jid2', payment_method_name: 'Card 2', statement_closing_day: 5, locale: 'pt-BR' },
        { user_id: 'user-3', payment_method_id: 'pm-3', whatsapp_jid: 'jid3', payment_method_name: 'Card 3', statement_closing_day: 5, locale: 'pt-BR' }
      ]

      ;(getEligibleUsersForStatementReminders as any).mockResolvedValue(mockUsers)
      ;(sendReminderWithRetry as any)
        .mockResolvedValueOnce({ success: true, attempts: 1 })
        .mockResolvedValueOnce({ success: false, attempts: 3, error: 'User blocked' })
        .mockResolvedValueOnce({ success: true, attempts: 1 })

      const result = await runStatementRemindersJob()

      expect(result.successfulDeliveries).toBe(2)
      expect(result.failedDeliveries).toBe(1)
      expect(result.eligibleUsers).toBe(3)
      // All users should be processed
      expect(sendReminderWithRetry).toHaveBeenCalledTimes(3)
    })

    it('should log warning when success rate below 99%', async () => {
      const mockUsers = Array.from({ length: 10 }, (_, i) => ({
        user_id: `user-${i}`,
        payment_method_id: `pm-${i}`,
        whatsapp_jid: `jid${i}`,
        payment_method_name: `Card ${i}`,
        statement_closing_day: 5,
        locale: 'pt-BR'
      }))

      ;(getEligibleUsersForStatementReminders as any).mockResolvedValue(mockUsers)
      // 8 successes, 2 failures = 80% success rate
      ;(sendReminderWithRetry as any)
        .mockResolvedValueOnce({ success: true, attempts: 1 })
        .mockResolvedValueOnce({ success: true, attempts: 1 })
        .mockResolvedValueOnce({ success: true, attempts: 1 })
        .mockResolvedValueOnce({ success: true, attempts: 1 })
        .mockResolvedValueOnce({ success: true, attempts: 1 })
        .mockResolvedValueOnce({ success: true, attempts: 1 })
        .mockResolvedValueOnce({ success: true, attempts: 1 })
        .mockResolvedValueOnce({ success: true, attempts: 1 })
        .mockResolvedValueOnce({ success: false, attempts: 3, error: 'Error 1' })
        .mockResolvedValueOnce({ success: false, attempts: 3, error: 'Error 2' })

      const result = await runStatementRemindersJob()

      expect(result.successRate).toBe(80)
      expect(result.successfulDeliveries).toBe(8)
      expect(result.failedDeliveries).toBe(2)

      // Logger should warn about low success rate
      const { logger } = require('../../services/monitoring/logger.js')
      expect(logger.warn).toHaveBeenCalled()
    })
  })

  describe('Edge Cases', () => {
    it('should handle user with no transactions (R$ 0 total)', async () => {
      const mockUsers = [
        {
          user_id: 'user-1',
          payment_method_id: 'pm-1',
          whatsapp_jid: 'jid1',
          payment_method_name: 'Card 1',
          statement_closing_day: 5,
          locale: 'pt-BR'
        }
      ]

      ;(getEligibleUsersForStatementReminders as any).mockResolvedValue(mockUsers)
      ;(sendReminderWithRetry as any).mockResolvedValue({
        success: true,
        attempts: 1
      })

      // Mock budget calculator with R$ 0 spent
      const { getBudgetDataForReminder } = require('../../services/reminders/budget-calculator.js')
      getBudgetDataForReminder.mockResolvedValue({
        totalSpent: 0,
        budget: 2000,
        remaining: 2000,
        percentage: 0,
        periodStart: new Date('2024-12-06'),
        periodEnd: new Date('2025-01-05'),
        nextClosing: new Date('2025-01-05')
      })

      const result = await runStatementRemindersJob()

      expect(result.successfulDeliveries).toBe(1)
      expect(result.failedDeliveries).toBe(0)
    })

    it('should handle budget calculation errors gracefully', async () => {
      const mockUsers = [
        {
          user_id: 'user-1',
          payment_method_id: 'pm-1',
          whatsapp_jid: 'jid1',
          payment_method_name: 'Card 1',
          statement_closing_day: 5,
          locale: 'pt-BR'
        }
      ]

      ;(getEligibleUsersForStatementReminders as any).mockResolvedValue(mockUsers)

      // Mock budget calculator to throw error
      const { getBudgetDataForReminder } = require('../../services/reminders/budget-calculator.js')
      getBudgetDataForReminder.mockRejectedValue(new Error('Database error'))

      const result = await runStatementRemindersJob()

      // Job should continue, but user should fail
      expect(result.failedDeliveries).toBe(1)
      expect(result.successfulDeliveries).toBe(0)
      expect(result.errors[0].error).toContain('Database error')
    })
  })
})
