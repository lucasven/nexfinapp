/**
 * Tests for Future Commitments Handler
 * Epic 2 Story 2.3: Future Commitments Dashboard
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { handleFutureCommitments } from '../../../handlers/credit-card/future-commitments-handler.js'

// Mock dependencies
jest.mock('../../../auth/session-manager.js')
jest.mock('../../../services/database/supabase-client.js')
jest.mock('../../../localization/i18n.js')
jest.mock('../../../analytics/index.js')
jest.mock('../../../services/monitoring/logger.js')

// Mock localization modules with proper format helpers
jest.mock('../../../localization/pt-br.js', () => ({
  messages: {
    futureCommitments: {
      title: 'Compromissos Futuros',
      empty_state: '📊 Compromissos Futuros\n\nVocê não tem parcelamentos ativos.\n\nPara criar um parcelamento, envie:\n"gastei 600 em 3x no celular"',
      month_summary: (month: string, year: string, amount: number, count: number) =>
        `📅 ${month}/${year}: R$ ${amount.toFixed(2).replace('.', ',')} (${count} ${count === 1 ? 'parcela' : 'parcelas'})`,
      installment_item: (description: string, current: number, total: number, amount: number) =>
        `  • ${description}: ${current}/${total} - R$ ${amount.toFixed(2).replace('.', ',')}`,
      total_next_months: (months: number, total: number) =>
        `Total próximos ${months} meses: R$ ${total.toFixed(2).replace('.', ',')}`,
      error: '❌ Erro ao carregar compromissos.'
    },
    genericError: '❌ Ocorreu um erro. Por favor, tente novamente.',
    notAuthenticated: '❌ Você não está autenticado.'
  },
  formatHelpers: {
    getMonthName: (month: number) => ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][month - 1] || 'Jan',
    formatCurrency: (amount: number) => `R$ ${amount.toFixed(2).replace('.', ',')}`
  }
}))

jest.mock('../../../localization/en.js', () => ({
  messages: {
    futureCommitments: {
      title: 'Future Commitments',
      empty_state: '📊 Future Commitments\n\nYou don\'t have any active installments.\n\nTo create an installment, send:\n"spent 600 in 3x on phone"',
      month_summary: (month: string, year: string, amount: number, count: number) =>
        `📅 ${month}/${year}: R$ ${amount.toFixed(2)} (${count} ${count === 1 ? 'payment' : 'payments'})`,
      installment_item: (description: string, current: number, total: number, amount: number) =>
        `  • ${description}: ${current}/${total} - R$ ${amount.toFixed(2)}`,
      total_next_months: (months: number, total: number) =>
        `Total next ${months} months: R$ ${total.toFixed(2)}`,
      error: '❌ Error loading commitments.'
    },
    genericError: '❌ An error occurred. Please try again.',
    notAuthenticated: '❌ You are not authenticated.'
  },
  formatHelpers: {
    getMonthName: (month: number) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1] || 'Jan',
    formatCurrency: (amount: number) => `R$ ${amount.toFixed(2)}`
  }
}))

import { getUserSession } from '../../../auth/session-manager.js'
import { getSupabaseClient } from '../../../services/database/supabase-client.js'
import { getUserLocale } from '../../../localization/i18n.js'

const mockGetUserSession = getUserSession as jest.MockedFunction<typeof getUserSession>
const mockGetSupabaseClient = getSupabaseClient as jest.MockedFunction<typeof getSupabaseClient>
const mockGetUserLocale = getUserLocale as jest.MockedFunction<typeof getUserLocale>

describe('handleFutureCommitments', () => {
  let mockSupabaseClient: any

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock Supabase client
    mockSupabaseClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      order: jest.fn(),
      single: jest.fn(),
    }

    mockGetSupabaseClient.mockReturnValue(mockSupabaseClient)
    mockGetUserLocale.mockResolvedValue('pt-br')
  })

  describe('AC3.4: WhatsApp Support', () => {
    it('should format response message correctly with multiple months and payments', async () => {
      // Setup
      mockGetUserSession.mockResolvedValue({
        userId: 'user-123',
        whatsappNumber: '+5511999999999'
      })

      // Mock installment payments query - 2 months with multiple payments each
      mockSupabaseClient.order.mockResolvedValue({
        data: [
          // January 2025
          { due_date: '2025-01-15', amount: 200, installment_number: 3, plan: { user_id: 'user-123', status: 'active', description: 'Celular', total_installments: 12 } },
          { due_date: '2025-01-20', amount: 150, installment_number: 5, plan: { user_id: 'user-123', status: 'active', description: 'Notebook', total_installments: 8 } },
          { due_date: '2025-01-25', amount: 100, installment_number: 1, plan: { user_id: 'user-123', status: 'active', description: 'Fone', total_installments: 3 } },
          // February 2025
          { due_date: '2025-02-15', amount: 200, installment_number: 4, plan: { user_id: 'user-123', status: 'active', description: 'Celular', total_installments: 12 } },
          { due_date: '2025-02-20', amount: 150, installment_number: 6, plan: { user_id: 'user-123', status: 'active', description: 'Notebook', total_installments: 8 } },
          { due_date: '2025-02-25', amount: 100, installment_number: 2, plan: { user_id: 'user-123', status: 'active', description: 'Fone', total_installments: 3 } },
        ],
        error: null
      })

      // Execute
      const result = await handleFutureCommitments('+5511999999999')

      // Assert
      expect(result).toContain('📊 Compromissos Futuros')
      expect(result).toContain('Jan/2025: R$ 450,00 (3 parcelas)')
      expect(result).toContain('Fev/2025: R$ 450,00 (3 parcelas)')
      expect(result).toContain('Celular')
      expect(result).toContain('Notebook')
      expect(result).toContain('Fone')
      expect(result).toContain('Total próximos 2 meses: R$ 900,00')
    })

    it('should show empty state message when no active installments', async () => {
      // Setup
      mockGetUserSession.mockResolvedValue({
        userId: 'user-123',
        whatsappNumber: '+5511999999999'
      })

      // Mock empty query result
      mockSupabaseClient.order.mockResolvedValue({
        data: [],
        error: null
      })

      // Execute
      const result = await handleFutureCommitments('+5511999999999')

      // Assert
      expect(result).toContain('📊 Compromissos Futuros')
      expect(result).toContain('Você não tem parcelamentos ativos')
      expect(result).toContain('Para criar um parcelamento, envie')
      expect(result).toContain('gastei 600 em 3x no celular')
    })

    it('should calculate 12-month total correctly', async () => {
      // Setup
      mockGetUserSession.mockResolvedValue({
        userId: 'user-123',
        whatsappNumber: '+5511999999999'
      })

      // Mock 3 months of payments
      mockSupabaseClient.order.mockResolvedValue({
        data: [
          { due_date: '2025-01-15', amount: 100, installment_number: 1, status: 'pending', plan: { user_id: 'user-123', status: 'active', description: 'Item 1', total_installments: 3 } },
          { due_date: '2025-02-15', amount: 100, installment_number: 2, status: 'pending', plan: { user_id: 'user-123', status: 'active', description: 'Item 1', total_installments: 3 } },
          { due_date: '2025-03-15', amount: 100, installment_number: 3, status: 'pending', plan: { user_id: 'user-123', status: 'active', description: 'Item 1', total_installments: 3 } },
        ],
        error: null
      })

      // Execute
      const result = await handleFutureCommitments('+5511999999999')

      // Assert
      expect(result).toContain('Total próximos 3 meses: R$ 300,00')
    })

    it('should use English locale when user preference is en', async () => {
      // Setup
      mockGetUserSession.mockResolvedValue({
        userId: 'user-123',
        whatsappNumber: '+5511999999999'
      })

      mockGetUserLocale.mockResolvedValue('en')

      // Mock payments
      mockSupabaseClient.order.mockResolvedValue({
        data: [
          { due_date: '2025-01-15', amount: 100, installment_number: 1, status: 'pending', plan: { user_id: 'user-123', status: 'active', description: 'Phone', total_installments: 3 } },
        ],
        error: null
      })

      // Execute
      const result = await handleFutureCommitments('+5511999999999')

      // Assert
      expect(result).toContain('📊 Future Commitments')
      expect(result).toContain('Jan/2025: R$ 100.00 (1 payment)')
      expect(result).toContain('Total next 1 months: R$ 100.00')
    })

    it('should handle single payment with correct singular formatting', async () => {
      // Setup
      mockGetUserSession.mockResolvedValue({
        userId: 'user-123',
        whatsappNumber: '+5511999999999'
      })

      // Mock single payment
      mockSupabaseClient.order.mockResolvedValue({
        data: [
          { due_date: '2025-01-15', amount: 100, installment_number: 1, status: 'pending', plan: { user_id: 'user-123', status: 'active', description: 'Item', total_installments: 1 } },
        ],
        error: null
      })

      // Execute
      const result = await handleFutureCommitments('+5511999999999')

      // Assert - should use singular "parcela" not "parcelas"
      expect(result).toContain('(1 parcela)')
    })

    it('should limit to 12 months when user has payments beyond 12 months', async () => {
      // Setup
      mockGetUserSession.mockResolvedValue({
        userId: 'user-123',
        whatsappNumber: '+5511999999999'
      })

      // Mock 15 months of payments (should only show first 12)
      const payments = []
      for (let i = 1; i <= 15; i++) {
        const month = i.toString().padStart(2, '0')
        payments.push({
          due_date: `2025-${month}-15`,
          amount: 100,
          installment_number: i,
          status: 'pending',
          plan: { user_id: 'user-123', status: 'active', description: 'Long-term item', total_installments: 15 }
        })
      }

      mockSupabaseClient.order.mockResolvedValue({
        data: payments,
        error: null
      })

      // Execute
      const result = await handleFutureCommitments('+5511999999999')

      // Assert - should only include 12 months
      const monthMatches = result.match(/2025/g)
      expect(monthMatches?.length).toBeLessThanOrEqual(12)
      expect(result).toContain('Total próximos 12 meses: R$ 1200,00') // 12 months × R$ 100
    })
  })
})
