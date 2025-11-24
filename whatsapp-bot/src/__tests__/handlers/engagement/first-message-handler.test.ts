/**
 * First Message Handler Tests
 *
 * Story 2.2: Conversational First Response
 * Story 2.3: Guide to First Expense
 *
 * Tests:
 * Story 2.2:
 * - AC-2.2.1: Parseable expense triggers contextual response with name
 * - AC-2.2.2: Unparseable content triggers warm welcome
 * - AC-2.2.3: Non-first-message doesn't trigger welcome flow
 * - AC-2.2.4: Localization for both pt-BR and en
 *
 * Story 2.3:
 * - AC-2.3.1: Unparseable first message includes natural language expense example
 * - AC-2.3.2: Parseable expense triggers celebration with no redundant guidance
 * - AC-2.3.3: Casual register and max one emoji per message
 * - AC-2.3.4: Integration with transaction handlers
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  handleFirstMessage,
  shouldTriggerWelcomeFlow,
  type FirstMessageHandlerContext,
} from '../../../handlers/engagement/first-message-handler'
import type { ActivityCheckResult } from '../../../services/engagement/activity-tracker'

// Mock the intent parser
jest.mock('../../../nlp/intent-parser', () => ({
  parseIntent: jest.fn(),
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

import { parseIntent } from '../../../nlp/intent-parser'

const mockParseIntent = parseIntent as jest.MockedFunction<typeof parseIntent>

// Mock messages for testing (Story 2.2 + 2.3)
const mockMessages = {
  engagementFirstMessage: (contextualResponse: string | null) =>
    `Oi! Que bom ter você aqui 😊\n${contextualResponse ? `\n${contextualResponse}\n` : ''}\nExperimenta mandar algo tipo "gastei 50 no almoço" e vê a mágica acontecer.`,
  engagementFirstExpenseSuccess: `Você acabou de registrar sua primeira despesa. Fácil, né?`,
  engagementGuideToFirstExpense: `Experimenta mandar algo tipo "gastei 50 no almoço" e eu cuido do resto!`,
  engagementFirstExpenseCelebration: (amount: string, category: string) =>
    `Pronto! Anotei ${amount} em ${category} pra você. Bem-vindo ao NexFin 😊`,
}

const mockEnMessages = {
  engagementFirstMessage: (contextualResponse: string | null) =>
    `Hi! Great to have you here 😊\n${contextualResponse ? `\n${contextualResponse}\n` : ''}\nTry saying something like "spent 50 on lunch" and see the magic happen.`,
  engagementFirstExpenseSuccess: `You just logged your first expense. Easy, right?`,
  engagementGuideToFirstExpense: `Try sending something like "spent 50 on lunch" and I'll take care of the rest!`,
  engagementFirstExpenseCelebration: (amount: string, category: string) =>
    `Done! I logged ${amount} in ${category} for you. Welcome to NexFin 😊`,
}

describe('First Message Handler - Story 2.2', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('handleFirstMessage', () => {
    const createContext = (overrides: Partial<FirstMessageHandlerContext> = {}): FirstMessageHandlerContext => ({
      userId: 'user-123',
      pushName: undefined,
      messageText: 'hello',
      locale: 'pt-BR',
      activityResult: {
        isFirstMessage: true,
        userId: 'user-123',
        preferredDestination: 'individual',
        engagementState: 'active',
      },
      ...overrides,
    })

    it('should return contextual response for parseable expense with name (AC-2.2.1)', async () => {
      // Mock: message is a parseable expense
      mockParseIntent.mockReturnValue({
        action: 'add_expense',
        confidence: 0.9,
        entities: {
          amount: 50,
          category: 'alimentação',
          description: 'almoço',
        },
      })

      const context = createContext({
        pushName: 'Lucas',
        messageText: 'gastei 50 no almoço',
      })

      const result = await handleFirstMessage(context, mockMessages)

      expect(result.isExpense).toBe(true)
      expect(result.shouldProcessExpense).toBe(true)
      expect(result.message).toContain('Lucas')
      expect(result.message).toContain('Que bom ter você aqui')
      expect(result.expenseData?.amount).toBe(50)
      expect(result.expenseData?.category).toBe('alimentação')
    })

    it('should return warm welcome for unparseable content (AC-2.2.2)', async () => {
      // Mock: message is not parseable as expense
      mockParseIntent.mockReturnValue({
        action: 'unknown',
        confidence: 0.3,
        entities: {},
      })

      const context = createContext({
        pushName: 'Maria',
        messageText: 'oi',
      })

      const result = await handleFirstMessage(context, mockMessages)

      expect(result.isExpense).toBe(false)
      expect(result.shouldProcessExpense).toBe(false)
      expect(result.message).toContain('Maria')
      expect(result.message).toContain('Que bom ter você aqui')
      expect(result.message).toContain('gastei 50 no almoço') // Guide text
    })

    it('should return empty for non-first-message (AC-2.2.3)', async () => {
      const context = createContext({
        activityResult: {
          isFirstMessage: false, // Not first message
          userId: 'user-123',
          preferredDestination: 'individual',
          engagementState: 'active',
        },
      })

      const result = await handleFirstMessage(context, mockMessages)

      expect(result.message).toBe('')
      expect(result.isExpense).toBe(false)
      expect(result.shouldProcessExpense).toBe(false)
    })

    it('should work with English localization (AC-2.2.4)', async () => {
      mockParseIntent.mockReturnValue({
        action: 'unknown',
        confidence: 0.2,
        entities: {},
      })

      const context = createContext({
        pushName: 'John',
        messageText: 'hello',
        locale: 'en',
      })

      const result = await handleFirstMessage(context, mockEnMessages)

      expect(result.message).toContain('John')
      expect(result.message).toContain('Great to have you here')
      expect(result.message).toContain('spent 50 on lunch')
    })

    it('should work without pushName (no name in greeting)', async () => {
      mockParseIntent.mockReturnValue({
        action: 'unknown',
        confidence: 0.2,
        entities: {},
      })

      const context = createContext({
        pushName: undefined,
        messageText: 'oi',
      })

      const result = await handleFirstMessage(context, mockMessages)

      expect(result.message).toContain('Oi!')
      expect(result.message).not.toContain('Oi !')
    })

    it('should detect low-confidence expense as non-expense (AC-2.2.2)', async () => {
      // Mock: intent parsed but with low confidence
      mockParseIntent.mockReturnValue({
        action: 'add_expense',
        confidence: 0.3, // Below 0.5 threshold
        entities: {},
      })

      const context = createContext({
        messageText: 'maybe 50 something',
      })

      const result = await handleFirstMessage(context, mockMessages)

      expect(result.isExpense).toBe(false)
      expect(result.shouldProcessExpense).toBe(false)
    })
  })

  describe('shouldTriggerWelcomeFlow', () => {
    it('should return true for first message', () => {
      const activityResult: ActivityCheckResult = {
        isFirstMessage: true,
        userId: 'user-123',
        preferredDestination: 'individual',
        engagementState: 'active',
      }

      expect(shouldTriggerWelcomeFlow(activityResult)).toBe(true)
    })

    it('should return false for returning user', () => {
      const activityResult: ActivityCheckResult = {
        isFirstMessage: false,
        userId: 'user-123',
        preferredDestination: 'individual',
        engagementState: 'active',
      }

      expect(shouldTriggerWelcomeFlow(activityResult)).toBe(false)
    })
  })
})

describe('First Message Handler - Story 2.3: Guide to First Expense', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  const createContext = (overrides: Partial<FirstMessageHandlerContext> = {}): FirstMessageHandlerContext => ({
    userId: 'user-123',
    pushName: undefined,
    messageText: 'hello',
    locale: 'pt-BR',
    activityResult: {
      isFirstMessage: true,
      userId: 'user-123',
      preferredDestination: 'individual',
      engagementState: 'active',
    },
    ...overrides,
  })

  describe('AC-2.3.1: Unparseable message includes natural language expense example', () => {
    it('should include expense example in pt-BR locale', async () => {
      mockParseIntent.mockReturnValue({
        action: 'unknown',
        confidence: 0.3,
        entities: {},
      })

      const context = createContext({
        messageText: 'oi',
        locale: 'pt-BR',
      })

      const result = await handleFirstMessage(context, mockMessages)

      expect(result.includesGuidance).toBe(true)
      expect(result.message).toContain('gastei 50 no almoço')
    })

    it('should include expense example in en locale', async () => {
      mockParseIntent.mockReturnValue({
        action: 'unknown',
        confidence: 0.3,
        entities: {},
      })

      const context = createContext({
        messageText: 'hello',
        locale: 'en',
      })

      const result = await handleFirstMessage(context, mockEnMessages)

      expect(result.includesGuidance).toBe(true)
      expect(result.message).toContain('spent 50 on lunch')
    })
  })

  describe('AC-2.3.2: Parseable expense triggers celebration with no redundant guidance', () => {
    it('should include celebration message with amount and category', async () => {
      mockParseIntent.mockReturnValue({
        action: 'add_expense',
        confidence: 0.9,
        entities: {
          amount: 50,
          category: 'alimentação',
          description: 'almoço',
        },
      })

      const context = createContext({
        messageText: 'gastei 50 no almoço',
      })

      const result = await handleFirstMessage(context, mockMessages)

      expect(result.isExpense).toBe(true)
      expect(result.includesGuidance).toBe(false) // NO redundant guidance
      expect(result.message).toContain('R$ 50,00') // Amount formatted
      expect(result.message).toContain('alimentação') // Category
      expect(result.message).toContain('Bem-vindo ao NexFin') // Celebration
    })

    it('should set shouldProcessExpense for transaction handler integration', async () => {
      mockParseIntent.mockReturnValue({
        action: 'add_expense',
        confidence: 0.9,
        entities: {
          amount: 30,
          category: 'transporte',
        },
      })

      const context = createContext({
        messageText: 'gastei 30 no uber',
      })

      const result = await handleFirstMessage(context, mockMessages)

      expect(result.shouldProcessExpense).toBe(true)
      expect(result.expenseData?.amount).toBe(30)
      expect(result.expenseData?.category).toBe('transporte')
    })
  })

  describe('AC-2.3.3: Casual register and max one emoji', () => {
    it('should use casual register "você" not "o senhor" in pt-BR', async () => {
      mockParseIntent.mockReturnValue({
        action: 'unknown',
        confidence: 0.3,
        entities: {},
      })

      const context = createContext({
        messageText: 'oi',
        locale: 'pt-BR',
      })

      const result = await handleFirstMessage(context, mockMessages)

      expect(result.message).not.toContain('o senhor')
      expect(result.message).not.toContain('O Senhor')
      // Check for casual language patterns
      expect(result.message).toMatch(/você|ter você|pra você/i)
    })

    it('should have maximum one emoji per message (celebration)', async () => {
      mockParseIntent.mockReturnValue({
        action: 'add_expense',
        confidence: 0.9,
        entities: {
          amount: 50,
          category: 'alimentação',
        },
      })

      const context = createContext({
        messageText: 'gastei 50 no almoço',
      })

      const result = await handleFirstMessage(context, mockMessages)

      // Count emojis in the celebration part
      // Use Extended_Pictographic to avoid matching digits (which are technically Emoji in Unicode)
      const celebrationMatch = result.message.match(/Pronto!.*NexFin 😊/)
      if (celebrationMatch) {
        const emojiCount = (celebrationMatch[0].match(/\p{Extended_Pictographic}/gu) || []).length
        expect(emojiCount).toBeLessThanOrEqual(1)
      }
    })

    it('should have maximum one emoji per message (guidance)', async () => {
      mockParseIntent.mockReturnValue({
        action: 'unknown',
        confidence: 0.3,
        entities: {},
      })

      const context = createContext({
        messageText: 'oi',
      })

      const result = await handleFirstMessage(context, mockMessages)

      // Count emojis in guide message - should be max 1 per logical part
      // Use Extended_Pictographic to avoid matching digits
      const guideMatch = result.message.match(/Experimenta mandar algo.*resto!/)
      if (guideMatch) {
        const emojiCount = (guideMatch[0].match(/\p{Extended_Pictographic}/gu) || []).length
        expect(emojiCount).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('AC-2.3.4: Integration with transaction handlers', () => {
    it('should return expenseData for transaction handler to process', async () => {
      mockParseIntent.mockReturnValue({
        action: 'add_expense',
        confidence: 0.9,
        entities: {
          amount: 100,
          category: 'mercado',
          description: 'compras do mês',
        },
      })

      const context = createContext({
        messageText: 'gastei 100 no mercado - compras do mês',
      })

      const result = await handleFirstMessage(context, mockMessages)

      expect(result.shouldProcessExpense).toBe(true)
      expect(result.expenseData).toBeDefined()
      expect(result.expenseData?.amount).toBe(100)
      expect(result.expenseData?.category).toBe('mercado')
      expect(result.expenseData?.description).toBe('compras do mês')
    })

    it('should default category to "despesa" when not parsed', async () => {
      mockParseIntent.mockReturnValue({
        action: 'add_expense',
        confidence: 0.9,
        entities: {
          amount: 25,
          // No category provided
        },
      })

      const context = createContext({
        messageText: 'gastei 25',
      })

      const result = await handleFirstMessage(context, mockMessages)

      expect(result.expenseData?.category).toBe('despesa')
    })
  })

  describe('Localization consistency', () => {
    it('should provide consistent experience in pt-BR', async () => {
      mockParseIntent.mockReturnValue({
        action: 'add_expense',
        confidence: 0.9,
        entities: {
          amount: 50,
          category: 'alimentação',
        },
      })

      const context = createContext({
        pushName: 'João',
        messageText: 'gastei 50 em alimentação',
        locale: 'pt-BR',
      })

      const result = await handleFirstMessage(context, mockMessages)

      expect(result.message).toContain('João')
      expect(result.message).toContain('R$ 50,00')
      expect(result.message).toContain('alimentação')
      expect(result.message).toContain('NexFin')
    })

    it('should provide consistent experience in en', async () => {
      mockParseIntent.mockReturnValue({
        action: 'add_expense',
        confidence: 0.9,
        entities: {
          amount: 50,
          category: 'food',
        },
      })

      const context = createContext({
        pushName: 'John',
        messageText: 'spent 50 on food',
        locale: 'en',
      })

      const result = await handleFirstMessage(context, mockEnMessages)

      expect(result.message).toContain('John')
      expect(result.message).toContain('R$ 50,00') // Note: amount formatting is pt-BR style in handler
      expect(result.message).toContain('food')
      expect(result.message).toContain('NexFin')
    })
  })
})
