/**
 * Tests for Installment Handler
 * Epic 2 Story 2.1: Add Installment Purchase (WhatsApp)
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals'
import { handleCreateInstallment, handleCardSelection } from '../../../handlers/credit-card/installment-handler.js'
import { ParsedIntent } from '../../../types.js'

// Mock dependencies
jest.mock('../../../auth/session-manager.js')
jest.mock('../../../services/database/supabase-client.js')
jest.mock('../../../localization/i18n.js')
jest.mock('../../../analytics/index.js')
jest.mock('../../../services/monitoring/logger.js')
jest.mock('../../../services/conversation/pending-installment-state.js')

import { getUserSession } from '../../../auth/session-manager.js'
import { getSupabaseClient } from '../../../services/database/supabase-client.js'
import { getUserLocale } from '../../../localization/i18n.js'
import {
  getPendingInstallmentContext,
  clearPendingInstallmentContext
} from '../../../services/conversation/pending-installment-state.js'

const mockGetUserSession = getUserSession as jest.MockedFunction<typeof getUserSession>
const mockGetSupabaseClient = getSupabaseClient as jest.MockedFunction<typeof getSupabaseClient>
const mockGetUserLocale = getUserLocale as jest.MockedFunction<typeof getUserLocale>
const mockGetPendingInstallmentContext = getPendingInstallmentContext as jest.MockedFunction<typeof getPendingInstallmentContext>
const mockClearPendingInstallmentContext = clearPendingInstallmentContext as jest.MockedFunction<typeof clearPendingInstallmentContext>

describe('handleCreateInstallment', () => {
  let mockSupabaseClient: any

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock Supabase client
    mockSupabaseClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn(),
      single: jest.fn(),
      rpc: jest.fn()
    }

    mockGetSupabaseClient.mockReturnValue(mockSupabaseClient)
    mockGetUserLocale.mockResolvedValue('pt-br')
  })

  describe('AC1.1: Natural Language Parsing', () => {
    it('should handle valid installment with all fields', async () => {
      // Setup
      mockGetUserSession.mockResolvedValue({
        userId: 'user-123',
        whatsappNumber: '+5511999999999'
      })

      // Mock credit card query - user has Credit Mode card
      // Query chain: .from().select().eq().eq().eq()
      mockSupabaseClient.eq
        .mockReturnValueOnce(mockSupabaseClient)  // First .eq(user_id)
        .mockReturnValueOnce(mockSupabaseClient)  // Second .eq(type)
        .mockResolvedValueOnce({                  // Third .eq(credit_mode) - final
          data: [{ id: 'card-1', name: 'Nubank', type: 'credit', credit_mode: true }],
          error: null
        })

      // Mock RPC success - create_installment_plan_atomic
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [{
          plan_id: 'plan-123',
          success: true,
          error_message: null
        }],
        error: null
      })

      // Mock installment payments query - .from().select().eq().order()
      mockSupabaseClient.order.mockResolvedValueOnce({
        data: [
          { id: 'payment-1', installment_number: 1, due_date: '2025-01-01', amount: 200 },
          { id: 'payment-2', installment_number: 2, due_date: '2025-02-01', amount: 200 },
          { id: 'payment-3', installment_number: 3, due_date: '2025-03-01', amount: 200 }
        ],
        error: null
      })

      // Mock payment method details query - .from().select().eq().single()
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { statement_closing_day: 15 },
        error: null
      })

      // Mock RPC for generate_transaction_id (called 3 times for 3 installments)
      mockSupabaseClient.rpc
        .mockResolvedValueOnce({ data: 'TXN-001', error: null })
        .mockResolvedValueOnce({ data: 'TXN-002', error: null })
        .mockResolvedValueOnce({ data: 'TXN-003', error: null })

      const intent: ParsedIntent = {
        action: 'create_installment',
        confidence: 0.95,
        entities: {
          amount: 600,
          installments: 3,
          description: 'celular',
          merchant: 'Magazine Luiza'
        }
      }

      // Execute
      const result = await handleCreateInstallment('+5511999999999', intent)

      // Assert
      expect(result).toContain('✅ Parcelamento criado')
      expect(result).toContain('celular')
      expect(result).toContain('R$ 600,00')
      expect(result).toContain('3x de R$ 200,00')
    })

    it('should handle installment without description', async () => {
      // Setup
      mockGetUserSession.mockResolvedValue({
        userId: 'user-123',
        whatsappNumber: '+5511999999999'
      })

      mockSupabaseClient.eq
        .mockReturnValueOnce(mockSupabaseClient)  // First .eq(user_id)
        .mockReturnValueOnce(mockSupabaseClient)  // Second .eq(type)
        .mockResolvedValueOnce({                  // Third .eq(credit_mode) - final
          data: [{ id: 'card-1', name: 'Nubank', type: 'credit', credit_mode: true }],
          error: null
        })

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [{
          plan_id: 'plan-123',
          success: true,
          error_message: null
        }],
        error: null
      })

      // Mock installment payments query - .from().select().eq().order()
      const mockPayments = Array.from({ length: 9 }, (_, i) => ({
        id: `payment-${i + 1}`,
        installment_number: i + 1,
        due_date: new Date(2025, i, 1).toISOString().split('T')[0],
        amount: 50
      }))
      mockSupabaseClient.order.mockResolvedValueOnce({
        data: mockPayments,
        error: null
      })

      // Mock payment method details query - .from().select().eq().single()
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { statement_closing_day: 15 },
        error: null
      })

      // Mock RPC for generate_transaction_id (called 9 times for 9 installments)
      for (let i = 1; i <= 9; i++) {
        mockSupabaseClient.rpc.mockResolvedValueOnce({ data: `TXN-00${i}`, error: null })
      }

      const intent: ParsedIntent = {
        action: 'create_installment',
        confidence: 0.95,
        entities: {
          amount: 450,
          installments: 9
        }
      }

      // Execute
      const result = await handleCreateInstallment('+5511999999999', intent)

      // Assert
      expect(result).toContain('✅ Parcelamento criado')
      expect(result).toContain('Parcelamento') // Default description
    })

    it('should ask for clarification when amount is missing', async () => {
      // Setup
      mockGetUserSession.mockResolvedValue({
        userId: 'user-123',
        whatsappNumber: '+5511999999999'
      })

      const intent: ParsedIntent = {
        action: 'create_installment',
        confidence: 0.95,
        entities: {
          installments: 3
        }
      }

      // Execute
      const result = await handleCreateInstallment('+5511999999999', intent)

      // Assert
      expect(result).toContain('Qual foi o valor total da compra?')
    })

    it('should ask for clarification when installments is missing', async () => {
      // Setup
      mockGetUserSession.mockResolvedValue({
        userId: 'user-123',
        whatsappNumber: '+5511999999999'
      })

      const intent: ParsedIntent = {
        action: 'create_installment',
        confidence: 0.95,
        entities: {
          amount: 600
        }
      }

      // Execute
      const result = await handleCreateInstallment('+5511999999999', intent)

      // Assert
      expect(result).toContain('Em quantas parcelas?')
    })
  })

  describe('AC1.2: Credit Mode Gating', () => {
    it('should block Simple Mode users', async () => {
      // Setup
      mockGetUserSession.mockResolvedValue({
        userId: 'user-123',
        whatsappNumber: '+5511999999999'
      })

      // Mock no Credit Mode cards
      mockSupabaseClient.eq
        .mockReturnValueOnce(mockSupabaseClient)  // First .eq(user_id)
        .mockReturnValueOnce(mockSupabaseClient)  // Second .eq(type)
        .mockResolvedValueOnce({                  // Third .eq(credit_mode) - final
          data: [],
          error: null
        })

      const intent: ParsedIntent = {
        action: 'create_installment',
        confidence: 0.95,
        entities: {
          amount: 600,
          installments: 3
        }
      }

      // Execute
      const result = await handleCreateInstallment('+5511999999999', intent)

      // Assert
      expect(result).toContain('Para usar parcelamentos, você precisa ativar o Modo Crédito')
    })

    it('should auto-select single Credit Mode card', async () => {
      // Setup
      mockGetUserSession.mockResolvedValue({
        userId: 'user-123',
        whatsappNumber: '+5511999999999'
      })

      mockSupabaseClient.eq
        .mockReturnValueOnce(mockSupabaseClient)  // First .eq(user_id)
        .mockReturnValueOnce(mockSupabaseClient)  // Second .eq(type)
        .mockResolvedValueOnce({                  // Third .eq(credit_mode) - final
          data: [{ id: 'card-1', name: 'Nubank', type: 'credit', credit_mode: true }],
          error: null
        })

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [{
          plan_id: 'plan-123',
          success: true,
          error_message: null
        }],
        error: null
      })

      // Mock installment payments query - .from().select().eq().order()
      mockSupabaseClient.order.mockResolvedValueOnce({
        data: [
          { id: 'payment-1', installment_number: 1, due_date: '2025-01-01', amount: 200 },
          { id: 'payment-2', installment_number: 2, due_date: '2025-02-01', amount: 200 },
          { id: 'payment-3', installment_number: 3, due_date: '2025-03-01', amount: 200 }
        ],
        error: null
      })

      // Mock payment method details query - .from().select().eq().single()
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { statement_closing_day: 15 },
        error: null
      })

      // Mock RPC for generate_transaction_id (called 3 times for 3 installments)
      mockSupabaseClient.rpc
        .mockResolvedValueOnce({ data: 'TXN-001', error: null })
        .mockResolvedValueOnce({ data: 'TXN-002', error: null })
        .mockResolvedValueOnce({ data: 'TXN-003', error: null })

      const intent: ParsedIntent = {
        action: 'create_installment',
        confidence: 0.95,
        entities: {
          amount: 600,
          installments: 3
        }
      }

      // Execute
      const result = await handleCreateInstallment('+5511999999999', intent)

      // Assert
      expect(result).toContain('✅ Parcelamento criado')
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'create_installment_plan_atomic',
        expect.objectContaining({
          p_payment_method_id: 'card-1'
        })
      )
    })

    it('should prompt user to select card when multiple Credit Mode cards exist', async () => {
      // Setup
      mockGetUserSession.mockResolvedValue({
        userId: 'user-123',
        whatsappNumber: '+5511999999999'
      })

      // Mock multiple Credit Mode cards
      mockSupabaseClient.eq
        .mockReturnValueOnce(mockSupabaseClient)  // First .eq(user_id)
        .mockReturnValueOnce(mockSupabaseClient)  // Second .eq(type)
        .mockResolvedValueOnce({                  // Third .eq(credit_mode) - final
          data: [
            { id: 'card-1', name: 'Nubank', type: 'credit', credit_mode: true },
            { id: 'card-2', name: 'Itaú', type: 'credit', credit_mode: true }
          ],
          error: null
        })

      const intent: ParsedIntent = {
        action: 'create_installment',
        confidence: 0.95,
        entities: {
          amount: 600,
          installments: 3,
          description: 'celular'
        }
      }

      // Execute
      const result = await handleCreateInstallment('+5511999999999', intent)

      // Assert - should prompt for card selection
      expect(result).toContain('Qual cartão você usou?')
      expect(result).toContain('(1) Nubank')
      expect(result).toContain('(2) Itaú')

      // Should NOT create installment yet
      expect(mockSupabaseClient.rpc).not.toHaveBeenCalled()
    })
  })

  describe('AC1.3: Validation', () => {
    it('should reject negative amounts', async () => {
      // Setup
      mockGetUserSession.mockResolvedValue({
        userId: 'user-123',
        whatsappNumber: '+5511999999999'
      })

      const intent: ParsedIntent = {
        action: 'create_installment',
        confidence: 0.95,
        entities: {
          amount: -500,
          installments: 3
        }
      }

      // Execute
      const result = await handleCreateInstallment('+5511999999999', intent)

      // Assert
      expect(result).toContain('O valor deve ser maior que zero')
    })

    it('should reject installments > 60', async () => {
      // Setup
      mockGetUserSession.mockResolvedValue({
        userId: 'user-123',
        whatsappNumber: '+5511999999999'
      })

      const intent: ParsedIntent = {
        action: 'create_installment',
        confidence: 0.95,
        entities: {
          amount: 1000,
          installments: 100
        }
      }

      // Execute
      const result = await handleCreateInstallment('+5511999999999', intent)

      // Assert
      expect(result).toContain('Número de parcelas deve ser entre 1 e 60')
    })

    it('should ask for clarification when installments is 0', async () => {
      // Setup
      mockGetUserSession.mockResolvedValue({
        userId: 'user-123',
        whatsappNumber: '+5511999999999'
      })

      const intent: ParsedIntent = {
        action: 'create_installment',
        confidence: 0.95,
        entities: {
          amount: 600,
          installments: 0
        }
      }

      // Execute
      const result = await handleCreateInstallment('+5511999999999', intent)

      // Assert - 0 is falsy, so it asks for clarification
      expect(result).toContain('Em quantas parcelas?')
    })
  })

  describe('AC1.4: Confirmation Message', () => {
    it('should format confirmation with correct dates and amounts', async () => {
      // Setup
      mockGetUserSession.mockResolvedValue({
        userId: 'user-123',
        whatsappNumber: '+5511999999999'
      })

      mockSupabaseClient.eq
        .mockReturnValueOnce(mockSupabaseClient)  // First .eq(user_id)
        .mockReturnValueOnce(mockSupabaseClient)  // Second .eq(type)
        .mockResolvedValueOnce({                  // Third .eq(credit_mode) - final
          data: [{ id: 'card-1', name: 'Nubank', type: 'credit', credit_mode: true }],
          error: null
        })

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [{
          plan_id: 'plan-123',
          success: true,
          error_message: null
        }],
        error: null
      })

      // Mock installment payments query - .from().select().eq().order()
      mockSupabaseClient.order.mockResolvedValueOnce({
        data: [
          { id: 'payment-1', installment_number: 1, due_date: '2025-01-01', amount: 200 },
          { id: 'payment-2', installment_number: 2, due_date: '2025-02-01', amount: 200 },
          { id: 'payment-3', installment_number: 3, due_date: '2025-03-01', amount: 200 }
        ],
        error: null
      })

      // Mock payment method details query - .from().select().eq().single()
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { statement_closing_day: 15 },
        error: null
      })

      // Mock RPC for generate_transaction_id (called 3 times for 3 installments)
      mockSupabaseClient.rpc
        .mockResolvedValueOnce({ data: 'TXN-001', error: null })
        .mockResolvedValueOnce({ data: 'TXN-002', error: null })
        .mockResolvedValueOnce({ data: 'TXN-003', error: null })

      const intent: ParsedIntent = {
        action: 'create_installment',
        confidence: 0.95,
        entities: {
          amount: 600,
          installments: 3,
          description: 'notebook'
        }
      }

      // Execute
      const result = await handleCreateInstallment('+5511999999999', intent)

      // Assert
      expect(result).toContain('✅ Parcelamento criado: notebook')
      expect(result).toContain('💰 Total: R$ 600,00 em 3x de R$ 200,00')
      expect(result).toContain('📅 Primeira parcela:')
      expect(result).toContain('📅 Última parcela:')
      expect(result).toContain('/parcelamentos')
    })
  })

  describe('Error Handling', () => {
    it('should handle RPC errors gracefully', async () => {
      // Setup
      mockGetUserSession.mockResolvedValue({
        userId: 'user-123',
        whatsappNumber: '+5511999999999'
      })

      mockSupabaseClient.eq
        .mockReturnValueOnce(mockSupabaseClient)  // First .eq(user_id)
        .mockReturnValueOnce(mockSupabaseClient)  // Second .eq(type)
        .mockResolvedValueOnce({                  // Third .eq(credit_mode) - final
          data: [{ id: 'card-1', name: 'Nubank', type: 'credit', credit_mode: true }],
          error: null
        })

      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      })

      const intent: ParsedIntent = {
        action: 'create_installment',
        confidence: 0.95,
        entities: {
          amount: 600,
          installments: 3
        }
      }

      // Execute
      const result = await handleCreateInstallment('+5511999999999', intent)

      // Assert
      expect(result).toContain('Ocorreu um erro')
    })

    it('should handle unauthenticated users', async () => {
      // Setup
      mockGetUserSession.mockResolvedValue(null)

      const intent: ParsedIntent = {
        action: 'create_installment',
        confidence: 0.95,
        entities: {
          amount: 600,
          installments: 3
        }
      }

      // Execute
      const result = await handleCreateInstallment('+5511999999999', intent)

      // Assert
      expect(result).toContain('Você precisa fazer login primeiro')
    })
  })
})

describe('handleCardSelection', () => {
  let mockSupabaseClient: any

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock Supabase client
    mockSupabaseClient = {
      rpc: jest.fn()
    }

    mockGetSupabaseClient.mockReturnValue(mockSupabaseClient)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('AC1.2 Scenario 3: Card Selection', () => {
    it('should create installment when user selects card by number', async () => {
      // Setup
      mockGetUserSession.mockResolvedValue({
        userId: 'user-123',
        whatsappNumber: '+5511999999999'
      })

      mockGetPendingInstallmentContext.mockReturnValue({
        type: 'pending_installment',
        amount: 600,
        installments: 3,
        description: 'celular',
        creditCards: [
          { id: 'card-1', name: 'Nubank' },
          { id: 'card-2', name: 'Itaú' }
        ],
        locale: 'pt-br',
        createdAt: new Date().toISOString()
      })

      // Mock Supabase client with all required query chains
      mockSupabaseClient.from = jest.fn().mockReturnThis()
      mockSupabaseClient.select = jest.fn().mockReturnThis()
      mockSupabaseClient.eq = jest.fn().mockReturnThis()
      mockSupabaseClient.order = jest.fn()
      mockSupabaseClient.single = jest.fn()

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [{
          plan_id: 'plan-123',
          success: true,
          error_message: null
        }],
        error: null
      })

      // Mock installment payments query
      mockSupabaseClient.order.mockResolvedValueOnce({
        data: [
          { id: 'payment-1', installment_number: 1, due_date: '2025-01-01', amount: 200 },
          { id: 'payment-2', installment_number: 2, due_date: '2025-02-01', amount: 200 },
          { id: 'payment-3', installment_number: 3, due_date: '2025-03-01', amount: 200 }
        ],
        error: null
      })

      // Mock payment method details query
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { statement_closing_day: 15 },
        error: null
      })

      // Mock RPC for generate_transaction_id (3 times)
      mockSupabaseClient.rpc
        .mockResolvedValueOnce({ data: 'TXN-001', error: null })
        .mockResolvedValueOnce({ data: 'TXN-002', error: null })
        .mockResolvedValueOnce({ data: 'TXN-003', error: null })

      // Execute - user selects card 2
      const result = await handleCardSelection('+5511999999999', '2')

      // Assert
      expect(result).toContain('✅ Parcelamento criado')
      expect(mockClearPendingInstallmentContext).toHaveBeenCalledWith('+5511999999999')
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'create_installment_plan_atomic',
        expect.objectContaining({
          p_payment_method_id: 'card-2'
        })
      )
    })

    it('should create installment when user selects card by name', async () => {
      // Setup
      mockGetUserSession.mockResolvedValue({
        userId: 'user-123',
        whatsappNumber: '+5511999999999'
      })

      mockGetPendingInstallmentContext.mockReturnValue({
        type: 'pending_installment',
        amount: 600,
        installments: 3,
        description: 'celular',
        creditCards: [
          { id: 'card-1', name: 'Nubank' },
          { id: 'card-2', name: 'Itaú' }
        ],
        locale: 'pt-br',
        createdAt: new Date().toISOString()
      })

      // Mock Supabase client with all required query chains
      mockSupabaseClient.from = jest.fn().mockReturnThis()
      mockSupabaseClient.select = jest.fn().mockReturnThis()
      mockSupabaseClient.eq = jest.fn().mockReturnThis()
      mockSupabaseClient.order = jest.fn()
      mockSupabaseClient.single = jest.fn()

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [{
          plan_id: 'plan-123',
          success: true,
          error_message: null
        }],
        error: null
      })

      // Mock installment payments query
      mockSupabaseClient.order.mockResolvedValueOnce({
        data: [
          { id: 'payment-1', installment_number: 1, due_date: '2025-01-01', amount: 200 },
          { id: 'payment-2', installment_number: 2, due_date: '2025-02-01', amount: 200 },
          { id: 'payment-3', installment_number: 3, due_date: '2025-03-01', amount: 200 }
        ],
        error: null
      })

      // Mock payment method details query
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { statement_closing_day: 15 },
        error: null
      })

      // Mock RPC for generate_transaction_id (3 times)
      mockSupabaseClient.rpc
        .mockResolvedValueOnce({ data: 'TXN-001', error: null })
        .mockResolvedValueOnce({ data: 'TXN-002', error: null })
        .mockResolvedValueOnce({ data: 'TXN-003', error: null })

      // Execute - user types "Nubank"
      const result = await handleCardSelection('+5511999999999', 'Nubank')

      // Assert
      expect(result).toContain('✅ Parcelamento criado')
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'create_installment_plan_atomic',
        expect.objectContaining({
          p_payment_method_id: 'card-1'
        })
      )
    })

    it('should handle invalid card selection', async () => {
      // Setup
      mockGetUserSession.mockResolvedValue({
        userId: 'user-123',
        whatsappNumber: '+5511999999999'
      })

      mockGetPendingInstallmentContext.mockReturnValue({
        type: 'pending_installment',
        amount: 600,
        installments: 3,
        description: 'celular',
        creditCards: [
          { id: 'card-1', name: 'Nubank' },
          { id: 'card-2', name: 'Itaú' }
        ],
        locale: 'pt-br',
        createdAt: new Date().toISOString()
      })

      // Execute - user types invalid selection
      const result = await handleCardSelection('+5511999999999', 'xyz')

      // Assert
      expect(result).toContain('Por favor, escolha um cartão válido')
      expect(result).toContain('(1) Nubank')
      expect(result).toContain('(2) Itaú')
      expect(mockSupabaseClient.rpc).not.toHaveBeenCalled()
      expect(mockClearPendingInstallmentContext).not.toHaveBeenCalled()
    })

    it('should handle missing pending context', async () => {
      // Setup
      mockGetUserSession.mockResolvedValue({
        userId: 'user-123',
        whatsappNumber: '+5511999999999'
      })

      mockGetPendingInstallmentContext.mockReturnValue(null)

      // Execute
      const result = await handleCardSelection('+5511999999999', '1')

      // Assert
      expect(result).toContain('Não encontrei um parcelamento pendente')
      expect(mockSupabaseClient.rpc).not.toHaveBeenCalled()
    })

    it('should handle partial card name match', async () => {
      // Setup
      mockGetUserSession.mockResolvedValue({
        userId: 'user-123',
        whatsappNumber: '+5511999999999'
      })

      mockGetPendingInstallmentContext.mockReturnValue({
        type: 'pending_installment',
        amount: 600,
        installments: 3,
        creditCards: [
          { id: 'card-1', name: 'Nubank Mastercard' },
          { id: 'card-2', name: 'Itaú Visa' }
        ],
        locale: 'pt-br',
        createdAt: new Date().toISOString()
      })

      // Mock Supabase client with all required query chains
      mockSupabaseClient.from = jest.fn().mockReturnThis()
      mockSupabaseClient.select = jest.fn().mockReturnThis()
      mockSupabaseClient.eq = jest.fn().mockReturnThis()
      mockSupabaseClient.order = jest.fn()
      mockSupabaseClient.single = jest.fn()

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [{
          plan_id: 'plan-123',
          success: true,
          error_message: null
        }],
        error: null
      })

      // Mock installment payments query
      mockSupabaseClient.order.mockResolvedValueOnce({
        data: [
          { id: 'payment-1', installment_number: 1, due_date: '2025-01-01', amount: 200 },
          { id: 'payment-2', installment_number: 2, due_date: '2025-02-01', amount: 200 },
          { id: 'payment-3', installment_number: 3, due_date: '2025-03-01', amount: 200 }
        ],
        error: null
      })

      // Mock payment method details query
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { statement_closing_day: 15 },
        error: null
      })

      // Mock RPC for generate_transaction_id (3 times)
      mockSupabaseClient.rpc
        .mockResolvedValueOnce({ data: 'TXN-001', error: null })
        .mockResolvedValueOnce({ data: 'TXN-002', error: null })
        .mockResolvedValueOnce({ data: 'TXN-003', error: null })

      // Execute - user types partial name "itau"
      const result = await handleCardSelection('+5511999999999', 'itau')

      // Assert
      expect(result).toContain('✅ Parcelamento criado')
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'create_installment_plan_atomic',
        expect.objectContaining({
          p_payment_method_id: 'card-2'
        })
      )
    })
  })
})
