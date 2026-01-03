/**
 * Statement Summary Message Builder
 *
 * Story 3.5: Pre-Statement Summary with Category Breakdown
 *
 * Builds WhatsApp message for statement summary with:
 * - Header (payment method + period)
 * - Total spent
 * - Budget status (if set)
 * - Category breakdown (top 5)
 * - Installment details per category
 * - CTA to web app
 */

import type { StatementSummary } from '../../types.js'
import { messages as ptBRMessages } from '../../localization/pt-br.js'
import { messages as enMessages } from '../../localization/en.js'
import {
  formatCurrencyForReminder,
  formatPeriodDates
} from '../../utils/formatters.js'

/**
 * Build statement summary message for WhatsApp
 *
 * @param summary - Statement summary data
 * @param locale - User locale (pt-BR or en)
 * @returns Formatted WhatsApp message
 */
export function buildStatementSummaryMessage(
  summary: StatementSummary,
  locale: string
): string {
  const messages = locale === 'pt-br' || locale === 'pt-BR' || locale === 'pt' ? ptBRMessages : enMessages
  const msg = messages.statementSummary

  // Fallback if statementSummary is not defined
  if (!msg) {
    return 'Statement summary unavailable.'
  }

  // Build message parts
  const parts: string[] = []

  // 1. Header with payment method name
  parts.push(msg.header(summary.paymentMethodName))
  parts.push('') // blank line

  // 2. Period dates
  const periodStr = formatPeriodDates(summary.periodStart, summary.periodEnd, locale)

  // DEBUG: Log formatted period
  console.log('🔍 DEBUG - Formatted period:', {
    periodStr,
    periodStart: summary.periodStart.toISOString(),
    periodEnd: summary.periodEnd.toISOString(),
    locale
  })

  parts.push(msg.period(periodStr.split(' - ')[0], periodStr.split(' - ')[1]))

  // 3. Total spent
  const totalFormatted = formatCurrencyForReminder(summary.totalSpent, locale)
  parts.push(msg.total(totalFormatted))

  // 4. Budget section (if budget set)
  if (summary.monthlyBudget && summary.budgetPercentage !== null) {
    const budgetFormatted = formatCurrencyForReminder(summary.monthlyBudget, locale)
    parts.push(msg.budget(budgetFormatted, summary.budgetPercentage))

    // Budget status message
    if (summary.budgetPercentage > 100) {
      const exceededAmount = summary.totalSpent - summary.monthlyBudget
      const exceededFormatted = formatCurrencyForReminder(exceededAmount, locale)
      parts.push(msg.exceeded(exceededFormatted))
    } else {
      const remainingAmount = summary.monthlyBudget - summary.totalSpent
      const remainingFormatted = formatCurrencyForReminder(remainingAmount, locale)
      parts.push(msg.remaining(remainingFormatted))
    }
  }

  // 5. Category breakdown header
  parts.push('') // blank line
  parts.push(msg.categoryHeader)
  parts.push('') // blank line

  // 6. Category lines (top 5 or all if <= 5)
  if (summary.categoryBreakdown.length === 0) {
    parts.push(msg.noTransactions)
  } else {
    for (const category of summary.categoryBreakdown) {
      const amountFormatted = formatCurrencyForReminder(category.amount, locale)
      const categoryLine = msg.categoryLine(
        category.categoryIcon || '📱',
        category.categoryName,
        amountFormatted,
        category.percentage
      )
      parts.push(categoryLine)

      // Transaction count
      if (category.transactionCount > 0) {
        parts.push(msg.transactionCount(category.transactionCount))
      }

      // Installment details
      if (category.includesInstallments && category.installmentDetails) {
        if (category.installmentDetails.length === 1) {
          // Single installment
          const inst = category.installmentDetails[0]
          const instAmount = formatCurrencyForReminder(inst.amount, locale)
          const instLine = `  - ${msg.installmentFormat(
            inst.description,
            inst.currentInstallment,
            inst.totalInstallments,
            instAmount
          )}`
          parts.push(instLine)
        } else if (category.installmentDetails.length > 1) {
          // Multiple installments
          parts.push(`  - ${msg.includesInstallments}`)
          for (const inst of category.installmentDetails) {
            const instAmount = formatCurrencyForReminder(inst.amount, locale)
            const instLine = msg.installmentBullet(
              inst.description,
              inst.currentInstallment,
              inst.totalInstallments,
              instAmount
            )
            parts.push(instLine)
          }
        }
      }

      parts.push('') // blank line after each category
    }
  }

  // 7. CTA footer
  parts.push(msg.cta)

  return parts.join('\n')
}
