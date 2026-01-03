/**
 * Unit Tests: Credit Mode Selection Handler
 *
 * Story: 1-3-credit-mode-vs-simple-mode-selection-whatsapp
 * Target Coverage: 85%
 */

import { handleModeSelection, sendModeSelectionPrompt } from '../../../handlers/credit-card/mode-selection'
import { storePendingTransactionContext, clearPendingTransactionContext, clearAllPendingTransactions } from '../../../services/conversation/pending-transaction-state'
import { getSupabaseClient } from '../../../services/database/supabase-client'
import { trackEvent } from '../../../analytics/tracker'
import { getUserLocale } from '../../../localization/i18n'

// Mock dependencies
jest.mock('../../../services/database/supabase-client')
jest.mock('../../../analytics/tracker')
jest.mock('../../../localization/i18n', () => ({
  getUserLocale: jest.fn(),
  getMessages: jest.fn((locale: string) => ({
    credit_mode: {
      selection_prompt: locale === 'en'
        ? 'How would you like to track this card?\n\n1️⃣ Credit Mode\n- Track installments (3x, 12x, etc)\n- Personal monthly budget\n- Statement closing reminders\n- Ideal for installment purchases\n\n2️⃣ Simple Mode\n- Treat as debit\n- No credit card features\n- Ideal for paying in full\n\nReply 1 or 2'
        : 'Como você quer acompanhar este cartão?\n\n1️⃣ Modo Crédito\n- Acompanhe parcelamentos (3x, 12x, etc)\n- Orçamento mensal personalizado\n- Lembrete de fechamento da fatura\n- Ideal para quem parcela compras\n\n2️⃣ Modo Simples\n- Trata como débito\n- Sem recursos de cartão de crédito\n- Ideal para quem paga a fatura em dia\n\nResponda 1 ou 2',
      confirmation_credit: locale === 'en'
        ? '✅ Credit Mode enabled! You can now add installments and track your statement.'
        : '✅ Modo Crédito ativado! Você pode adicionar parcelamentos e acompanhar sua fatura.',
      confirmation_simple: locale === 'en'
        ? '✅ Simple Mode enabled! This card will be treated like debit.'
        : '✅ Modo Simples ativado! Este cartão será tratado como débito.',
      invalid_input: locale === 'en'
        ? 'Please reply 1 for Credit Mode or 2 for Simple Mode.'
        : 'Por favor, responda 1 para Modo Crédito ou 2 para Modo Simples.'
    }
  }))
}))

const mockSupabase = {
  from: jest.fn(),
  rpc: jest.fn()
}

describe('Credit Mode Selection Handler', () => {
  const testUserId = 'user-123'
  const testWhatsappNumber = '+5511999999999'
  const testPaymentMethodId = 'pm-456'

  beforeEach(() => {
    jest.clearAllMocks()
    clearAllPendingTransactions()

    // Setup default mocks
    ;(getSupabaseClient as jest.Mock).mockReturnValue(mockSupabase)
    ;(getUserLocale as jest.Mock).mockResolvedValue('pt-br')
  })

  describe('handleModeSelection', () => {
    describe('AC3.2: Credit Mode Selection (Option 1)', () => {
      it('should select Credit Mode when user responds "1"', async () => {
        // Setup pending transaction
        storePendingTransactionContext(testWhatsappNumber, {
          paymentMethodId: testPaymentMethodId,
          amount: 100,
          categoryId: 'cat-1',
          description: 'Test purchase',
          date: '2025-12-02',
          locale: 'pt-BR',
          transactionType: 'expense'
        })

        // Mock database responses
        mockSupabase.from.mockReturnValue({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                is: jest.fn().mockResolvedValue({ error: null })
              })
            })
          })
        })

        mockSupabase.rpc.mockResolvedValue({ data: 'TXN123', error: null })

        mockSupabase.from.mockReturnValueOnce({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                is: jest.fn().mockResolvedValue({ error: null })
              })
            })
          })
        }).mockReturnValueOnce({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: 'tx-789' },
                error: null
              })
            })
          })
        })

        // Execute
        const result = await handleModeSelection('1', testWhatsappNumber, testUserId)

        // Assert
        expect(result).toContain('Modo Crédito ativado')
        expect(trackEvent).toHaveBeenCalledWith(
          'credit_mode_selected',
          testUserId,
          expect.objectContaining({
            paymentMethodId: testPaymentMethodId,
            mode: 'credit',
            channel: 'whatsapp'
          })
        )
      })

      it('should select Credit Mode when user responds "crédito"', async () => {
        storePendingTransactionContext(testWhatsappNumber, {
          paymentMethodId: testPaymentMethodId,
          amount: 100,
          date: '2025-12-02',
          locale: 'pt-BR',
          transactionType: 'expense'
        })

        mockSupabase.from.mockReturnValueOnce({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                is: jest.fn().mockResolvedValue({ error: null })
              })
            })
          })
        }).mockReturnValueOnce({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: 'tx-789' },
                error: null
              })
            })
          })
        })

        mockSupabase.rpc.mockResolvedValue({ data: 'TXN123', error: null })

        const result = await handleModeSelection('crédito', testWhatsappNumber, testUserId)

        expect(result).toContain('Modo Crédito ativado')
      })

      it('should select Credit Mode when user responds "credit"', async () => {
        storePendingTransactionContext(testWhatsappNumber, {
          paymentMethodId: testPaymentMethodId,
          amount: 100,
          date: '2025-12-02',
          locale: 'en',
          transactionType: 'expense'
        })

        ;(getUserLocale as jest.Mock).mockResolvedValue('en')

        mockSupabase.from.mockReturnValueOnce({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                is: jest.fn().mockResolvedValue({ error: null })
              })
            })
          })
        }).mockReturnValueOnce({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: 'tx-789' },
                error: null
              })
            })
          })
        })

        mockSupabase.rpc.mockResolvedValue({ data: 'TXN123', error: null })

        const result = await handleModeSelection('credit', testWhatsappNumber, testUserId)

        expect(result).toContain('Credit Mode enabled')
      })
    })

    describe('AC3.3: Simple Mode Selection (Option 2)', () => {
      it('should select Simple Mode when user responds "2"', async () => {
        storePendingTransactionContext(testWhatsappNumber, {
          paymentMethodId: testPaymentMethodId,
          amount: 100,
          date: '2025-12-02',
          locale: 'pt-BR',
          transactionType: 'expense'
        })

        mockSupabase.from.mockReturnValueOnce({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                is: jest.fn().mockResolvedValue({ error: null })
              })
            })
          })
        }).mockReturnValueOnce({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: 'tx-789' },
                error: null
              })
            })
          })
        })

        mockSupabase.rpc.mockResolvedValue({ data: 'TXN123', error: null })

        const result = await handleModeSelection('2', testWhatsappNumber, testUserId)

        expect(result).toContain('Modo Simples ativado')
        expect(trackEvent).toHaveBeenCalledWith(
          'credit_mode_selected',
          testUserId,
          expect.objectContaining({
            paymentMethodId: testPaymentMethodId,
            mode: 'simple',
            channel: 'whatsapp'
          })
        )
      })

      it('should select Simple Mode when user responds "simples"', async () => {
        storePendingTransactionContext(testWhatsappNumber, {
          paymentMethodId: testPaymentMethodId,
          amount: 100,
          date: '2025-12-02',
          locale: 'pt-BR',
          transactionType: 'expense'
        })

        mockSupabase.from.mockReturnValueOnce({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                is: jest.fn().mockResolvedValue({ error: null })
              })
            })
          })
        }).mockReturnValueOnce({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: 'tx-789' },
                error: null
              })
            })
          })
        })

        mockSupabase.rpc.mockResolvedValue({ data: 'TXN123', error: null })

        const result = await handleModeSelection('simples', testWhatsappNumber, testUserId)

        expect(result).toContain('Modo Simples ativado')
      })
    })

    describe('AC3.4: Invalid Input Handling', () => {
      it('should return invalid input message for unrecognized text', async () => {
        storePendingTransactionContext(testWhatsappNumber, {
          paymentMethodId: testPaymentMethodId,
          amount: 100,
          date: '2025-12-02',
          locale: 'pt-BR',
          transactionType: 'expense'
        })

        const result = await handleModeSelection('maybe', testWhatsappNumber, testUserId)

        expect(result).toContain('Por favor, responda 1 para Modo Crédito ou 2 para Modo Simples')
        expect(trackEvent).not.toHaveBeenCalled()
      })

      it('should return invalid input message for "yes"', async () => {
        storePendingTransactionContext(testWhatsappNumber, {
          paymentMethodId: testPaymentMethodId,
          amount: 100,
          date: '2025-12-02',
          locale: 'pt-BR',
          transactionType: 'expense'
        })

        const result = await handleModeSelection('yes', testWhatsappNumber, testUserId)

        expect(result).toContain('Por favor, responda 1')
      })

      it('should return invalid input message for random text', async () => {
        storePendingTransactionContext(testWhatsappNumber, {
          paymentMethodId: testPaymentMethodId,
          amount: 100,
          date: '2025-12-02',
          locale: 'pt-BR',
          transactionType: 'expense'
        })

        const result = await handleModeSelection('não sei', testWhatsappNumber, testUserId)

        expect(result).toContain('Por favor, responda 1')
      })
    })

    describe('No Pending Transaction Context', () => {
      it('should return error message when no pending transaction exists', async () => {
        // No pending transaction stored

        const result = await handleModeSelection('1', testWhatsappNumber, testUserId)

        expect(result).toContain('Não encontrei uma transação pendente')
      })
    })
  })

  describe('sendModeSelectionPrompt', () => {
    it('should return Portuguese prompt when user locale is pt-BR', async () => {
      ;(getUserLocale as jest.Mock).mockResolvedValue('pt-br')

      const result = await sendModeSelectionPrompt(testUserId)

      expect(result).toContain('Como você quer acompanhar este cartão?')
      expect(result).toContain('1️⃣ Modo Crédito')
      expect(result).toContain('2️⃣ Modo Simples')
      expect(result).toContain('Responda 1 ou 2')
    })

    it('should return English prompt when user locale is en', async () => {
      ;(getUserLocale as jest.Mock).mockResolvedValue('en')

      const result = await sendModeSelectionPrompt(testUserId)

      expect(result).toContain('How would you like to track this card?')
      expect(result).toContain('1️⃣ Credit Mode')
      expect(result).toContain('2️⃣ Simple Mode')
      expect(result).toContain('Reply 1 or 2')
    })

    it('should fallback to Portuguese on error', async () => {
      ;(getUserLocale as jest.Mock).mockRejectedValue(new Error('DB error'))

      const result = await sendModeSelectionPrompt(testUserId)

      expect(result).toContain('Como você quer acompanhar este cartão?')
    })
  })
})
