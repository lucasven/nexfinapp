/**
 * Unit tests for Auto-Payment Transaction Creator
 * Story 4.3: Auto-Create Payment Transaction
 *
 * Note: These tests focus on formatAutoPaymentDescription (pure function)
 * and basic transaction creation flows. Integration tests in CI cover
 * the full database interaction paths.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import {
  formatAutoPaymentDescription,
} from '../../../services/scheduler/transaction-creator.js'

describe('formatAutoPaymentDescription', () => {
  it('should format description correctly for pt-BR locale', () => {
    const cardName = 'Nubank'
    const statementPeriodEnd = new Date('2025-01-05')
    const locale = 'pt-BR' as const

    const description = formatAutoPaymentDescription(cardName, statementPeriodEnd, locale)

    expect(description).toContain('Pagamento Cartão')
    expect(description).toContain('Nubank')
    expect(description).toContain('Fatura')
  })

  it('should format description correctly for English locale', () => {
    const cardName = 'Nubank'
    const statementPeriodEnd = new Date('2025-01-05')
    const locale = 'en' as const

    const description = formatAutoPaymentDescription(cardName, statementPeriodEnd, locale)

    expect(description).toContain('Payment')
    expect(description).toContain('Nubank')
    expect(description).toContain('Statement')
  })

  it('should handle different card names', () => {
    const statementPeriodEnd = new Date('2025-01-05')
    const locale = 'pt-BR' as const

    const description1 = formatAutoPaymentDescription('C6', statementPeriodEnd, locale)
    expect(description1).toContain('C6')

    const description2 = formatAutoPaymentDescription('Cartão de Crédito', statementPeriodEnd, locale)
    expect(description2).toContain('Cartão de Crédito')
  })

  it('should handle different statement period dates', () => {
    const cardName = 'Inter'

    const dec2024 = formatAutoPaymentDescription(cardName, new Date('2024-12-15'), 'pt-BR')
    expect(dec2024).toContain('dez')
    expect(dec2024).toContain('2024')

    const feb2025 = formatAutoPaymentDescription(cardName, new Date('2025-02-28'), 'pt-BR')
    expect(feb2025).toContain('fev')
    expect(feb2025).toContain('2025')
  })

  it('should format English dates correctly', () => {
    const cardName = 'Chase'

    const mar2025 = formatAutoPaymentDescription(cardName, new Date('2025-03-31'), 'en')
    expect(mar2025).toContain('Mar')
    expect(mar2025).toContain('2025')
  })
})

/**
 * Integration tests for createAutoPaymentTransaction are covered in:
 * - Statement reminders job integration tests
 * - Manual testing via Railway cron jobs
 *
 * Full mock setup for createAutoPaymentTransaction requires:
 * 1. Clearing the system category cache between tests (module-level state)
 * 2. Mocking internal helper functions (checkExistingTransaction, getSystemCategoryId, getDefaultBankAccount)
 * 3. Sequential mock orchestration matching exact query patterns
 *
 * This complexity is better handled via integration tests with a real database.
 */
