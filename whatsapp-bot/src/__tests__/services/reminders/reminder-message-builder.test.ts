/**
 * Tests for Reminder Message Builder
 *
 * AC4.2: Reminder Message Content and Format
 * - With budget → Budget section included
 * - No budget → Budget section excluded
 * - Budget exceeded → "acima do planejado" message
 * - pt-BR locale → Portuguese message
 * - en locale → English message
 * - Awareness-first language (no judgmental tone)
 */

import { buildReminderMessage } from '../../../services/reminders/reminder-message-builder.js'
import type { EligibleUser } from '../../../services/reminders/statement-reminder-query.js'
import type { BudgetData } from '../../../services/reminders/budget-calculator.js'

describe('Reminder Message Builder', () => {
  const mockUser: EligibleUser = {
    user_id: 'user-1',
    whatsapp_jid: 'jid123',
    whatsapp_lid: null,
    whatsapp_number: '5511999999999',
    locale: 'pt-BR',
    payment_method_id: 'pm-1',
    payment_method_name: 'Nubank Roxinho',
    statement_closing_day: 5,
    monthly_budget: 2000
  }

  const mockBudgetData: BudgetData = {
    totalSpent: 1700,
    budget: 2000,
    remaining: 300,
    percentage: 85,
    periodStart: new Date('2024-12-06'),
    periodEnd: new Date('2025-01-05'),
    nextClosing: new Date('2025-01-05')
  }

  describe('Message Structure', () => {
    it('should build complete message with all sections (pt-BR, with budget)', () => {
      const message = buildReminderMessage({ user: mockUser, budgetData: mockBudgetData })

      expect(message).toContain('Olá! 👋') // Greeting
      expect(message).toContain('Nubank Roxinho') // Payment method name
      expect(message).toContain('fecha em 3 dias') // Closing date
      expect(message).toContain('📅 Período atual:') // Period
      expect(message).toContain('💳 Total até agora:') // Total spent
      expect(message).toContain('📊 Orçamento:') // Budget section
      expect(message).toContain('85% usado') // Budget percentage
      expect(message).toContain('Restam') // Remaining amount
      expect(message).toContain('Para ver os detalhes') // CTA
    })

    it('should exclude budget section when budget is null', () => {
      const budgetDataNoBudget: BudgetData = {
        ...mockBudgetData,
        budget: null,
        remaining: 0,
        percentage: 0
      }

      const message = buildReminderMessage({ user: mockUser, budgetData: budgetDataNoBudget })

      expect(message).toContain('Olá! 👋')
      expect(message).toContain('💳 Total até agora:')
      expect(message).not.toContain('📊 Orçamento:') // No budget section
      expect(message).not.toContain('Restam') // No remaining message
      expect(message).toContain('Para ver os detalhes')
    })

    it('should exclude budget section when budget is 0', () => {
      const budgetDataZero: BudgetData = {
        ...mockBudgetData,
        budget: 0,
        remaining: 0,
        percentage: 0
      }

      const message = buildReminderMessage({ user: mockUser, budgetData: budgetDataZero })

      expect(message).not.toContain('📊 Orçamento:')
      expect(message).not.toContain('Restam')
    })
  })

  describe('Budget Status Messages', () => {
    it('should show "Restam" message when budget not exceeded (pt-BR)', () => {
      const budgetDataOnTrack: BudgetData = {
        ...mockBudgetData,
        totalSpent: 800,
        remaining: 1200,
        percentage: 40
      }

      const message = buildReminderMessage({ user: mockUser, budgetData: budgetDataOnTrack })

      expect(message).toContain('Restam')
      expect(message).not.toContain('acima do planejado')
    })

    it('should show "acima do planejado" message when budget exceeded (pt-BR)', () => {
      const budgetDataExceeded: BudgetData = {
        ...mockBudgetData,
        totalSpent: 2400,
        budget: 2000,
        remaining: -400,
        percentage: 120
      }

      const message = buildReminderMessage({ user: mockUser, budgetData: budgetDataExceeded })

      expect(message).toContain('acima do planejado')
      expect(message).not.toContain('Restam')
    })

    it('should handle exactly at budget (100%)', () => {
      const budgetDataExact: BudgetData = {
        ...mockBudgetData,
        totalSpent: 2000,
        budget: 2000,
        remaining: 0,
        percentage: 100
      }

      const message = buildReminderMessage({ user: mockUser, budgetData: budgetDataExact })

      // At exactly 100%, remaining is 0, so "Restam R$ 0,00" is shown
      expect(message).toContain('Restam')
    })
  })

  describe('Localization', () => {
    it('should generate Portuguese message for pt-BR locale', () => {
      const message = buildReminderMessage({ user: mockUser, budgetData: mockBudgetData })

      expect(message).toContain('Olá! 👋')
      expect(message).toContain('Sua fatura')
      expect(message).toContain('fecha em')
      expect(message).toContain('Período atual:')
      expect(message).toContain('Total até agora:')
      expect(message).toContain('Orçamento:')
      expect(message).toContain('usado')
      expect(message).toContain('Restam')
      expect(message).toContain('para o seu orçamento mensal')
    })

    it('should generate English message for en locale', () => {
      const userEn: EligibleUser = {
        ...mockUser,
        locale: 'en'
      }

      const message = buildReminderMessage({ user: userEn, budgetData: mockBudgetData })

      expect(message).toContain('Hello! 👋')
      expect(message).toContain('Your')
      expect(message).toContain('statement closes in')
      expect(message).toContain('Current period:')
      expect(message).toContain('Total so far:')
      expect(message).toContain('Budget:')
      expect(message).toContain('used')
      expect(message).toContain('You have')
      expect(message).toContain('remaining for your monthly budget')
    })

    it('should show "over budget" message in English when exceeded', () => {
      const userEn: EligibleUser = {
        ...mockUser,
        locale: 'en'
      }

      const budgetDataExceeded: BudgetData = {
        ...mockBudgetData,
        totalSpent: 2400,
        budget: 2000,
        remaining: -400,
        percentage: 120
      }

      const message = buildReminderMessage({ user: userEn, budgetData: budgetDataExceeded })

      expect(message).toContain('You are')
      expect(message).toContain('over budget for this month')
      expect(message).not.toContain('remaining')
    })
  })

  describe('Awareness-First Language', () => {
    it('should use neutral greeting (not alarming)', () => {
      const message = buildReminderMessage({ user: mockUser, budgetData: mockBudgetData })

      expect(message).toContain('Olá! 👋')
      expect(message).not.toContain('AVISO')
      expect(message).not.toContain('WARNING')
      expect(message).not.toContain('ATENÇÃO')
    })

    it('should use informational closing language (not urgent)', () => {
      const message = buildReminderMessage({ user: mockUser, budgetData: mockBudgetData })

      expect(message).toContain('fecha em 3 dias')
      expect(message).not.toContain('FECHA EM BREVE')
      expect(message).not.toContain('CLOSING SOON')
      expect(message).not.toContain('URGENTE')
    })

    it('should use factual budget status (not judgmental)', () => {
      const message = buildReminderMessage({ user: mockUser, budgetData: mockBudgetData })

      expect(message).toContain('85% usado')
      expect(message).not.toContain('PERIGO')
      expect(message).not.toContain('DANGER')
      expect(message).not.toContain('ALERTA')
    })

    it('should use positive framing for remaining budget', () => {
      const message = buildReminderMessage({ user: mockUser, budgetData: mockBudgetData })

      expect(message).toContain('Restam')
      expect(message).not.toContain('Você só tem')
      expect(message).not.toContain('You only have')
    })

    it('should use neutral language for budget exceeded (not alarming)', () => {
      const budgetDataExceeded: BudgetData = {
        ...mockBudgetData,
        totalSpent: 2400,
        budget: 2000,
        remaining: -400,
        percentage: 120
      }

      const message = buildReminderMessage({ user: mockUser, budgetData: budgetDataExceeded })

      expect(message).toContain('acima do planejado')
      expect(message).not.toContain('ESTOUROU')
      expect(message).not.toContain('OVERSPENT')
      expect(message).not.toContain('EXCESSO')
    })

    it('should avoid pressure or judgment language', () => {
      const message = buildReminderMessage({ user: mockUser, budgetData: mockBudgetData })

      expect(message).not.toContain('Bom trabalho!')
      expect(message).not.toContain('Good job!')
      expect(message).not.toContain('Continue assim!')
      expect(message).not.toContain('Keep it up!')
    })
  })

  describe('Currency Formatting', () => {
    it('should format currency in pt-BR format (R$ 1.700,00)', () => {
      const message = buildReminderMessage({ user: mockUser, budgetData: mockBudgetData })

      // Check that currency is formatted (exact format depends on Intl.NumberFormat)
      expect(message).toMatch(/R\$\s*[\d.,]+/)
    })

    it('should format currency in en format (R$ 1,700.00)', () => {
      const userEn: EligibleUser = {
        ...mockUser,
        locale: 'en'
      }

      const message = buildReminderMessage({ user: userEn, budgetData: mockBudgetData })

      expect(message).toMatch(/R\$\s*[\d.,]+/)
    })
  })

  describe('Error Handling', () => {
    it('should throw error if statementReminder messages not found', () => {
      const userInvalidLocale: EligibleUser = {
        ...mockUser,
        locale: 'fr' // Unsupported locale
      }

      expect(() => {
        buildReminderMessage({ user: userInvalidLocale, budgetData: mockBudgetData })
      }).toThrow('Statement reminder messages not found for locale: fr')
    })
  })
})
