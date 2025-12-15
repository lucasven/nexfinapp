/**
 * Reminder Message Builder
 *
 * Formats localized reminder messages with awareness-first language.
 * - Statement closing reminders (Story 3.4)
 * - Payment due reminders (Story 4.2)
 */

import { messages as ptBRMessages } from '../../localization/pt-br.js'
import { messages as enMessages } from '../../localization/en.js'
import { formatClosingDate, formatPeriodDates, formatCurrencyForReminder } from '../../utils/formatters.js'
import type { BudgetData } from './budget-calculator.js'
import type { EligibleUser } from './statement-reminder-query.js'
import type { EligiblePaymentReminder } from './payment-reminder-query.js'

interface ReminderMessageData {
  user: EligibleUser
  budgetData: BudgetData
}

/**
 * Get localized messages for a given locale
 */
function getMessages(locale: string) {
  if (locale === 'pt-br' || locale === 'pt-BR' || locale === 'pt') {
    return ptBRMessages
  }
  if (locale === 'en') {
    return enMessages
  }
  // Default to English for unsupported locales, but validate statementReminder exists
  return enMessages
}

/**
 * Build a statement reminder message
 *
 * Message structure:
 * 1. Greeting
 * 2. Closing date (3 days)
 * 3. Statement period
 * 4. Total spent to date
 * 5. Budget status (if budget set)
 * 6. Remaining/exceeded message (if budget set)
 * 7. Call-to-action
 *
 * Awareness-first language:
 * - Neutral greeting ("Olá!" not "WARNING!")
 * - Informational closing ("fecha em 3 dias" not "CLOSING SOON!")
 * - Factual budget status ("85% usado" not "DANGER: NEAR LIMIT!")
 * - Positive framing ("Restam R$ 300" not "You only have R$ 300 left")
 * - Neutral overage ("R$ 400 acima do planejado" not "OVERSPENT BY R$ 400!")
 */
export function buildReminderMessage(data: ReminderMessageData): string {
  const { user, budgetData } = data
  const locale = user.locale || 'pt-BR'

  // Validate supported locales
  const supportedLocales = ['pt-BR', 'pt', 'en']
  if (!supportedLocales.includes(locale)) {
    throw new Error(`Statement reminder messages not found for locale: ${locale}`)
  }

  const msg = getMessages(locale).statementReminder

  if (!msg) {
    throw new Error(`Statement reminder messages not found for locale: ${locale}`)
  }

  const messageParts: string[] = []

  // 1. Greeting
  messageParts.push(msg.greeting)
  messageParts.push('')

  // 2. Closing date (3 days from now)
  const closingDateFormatted = formatClosingDate(budgetData.nextClosing, locale)
  messageParts.push(msg.closingIn(user.payment_method_name, 3, closingDateFormatted))
  messageParts.push('')

  // 3. Statement period
  const periodFormatted = formatPeriodDates(budgetData.periodStart, budgetData.periodEnd, locale)
  messageParts.push(msg.period(periodFormatted.split(' - ')[0], periodFormatted.split(' - ')[1]))

  // 4. Total spent to date
  const totalSpentFormatted = formatCurrencyForReminder(budgetData.totalSpent, locale)
  messageParts.push(msg.total(totalSpentFormatted))

  // 5. Budget status (if budget set)
  if (budgetData.budget && budgetData.budget > 0) {
    const budgetFormatted = formatCurrencyForReminder(budgetData.budget, locale)
    messageParts.push(msg.budget(budgetFormatted, budgetData.percentage))
    messageParts.push('')

    // 6. Remaining/exceeded message
    if (budgetData.remaining >= 0) {
      // On track or near limit (but not exceeded)
      const remainingFormatted = formatCurrencyForReminder(budgetData.remaining, locale)
      messageParts.push(msg.remaining(remainingFormatted))
    } else {
      // Exceeded budget
      const exceededAmount = Math.abs(budgetData.remaining)
      const exceededFormatted = formatCurrencyForReminder(exceededAmount, locale)
      messageParts.push(msg.exceeded(exceededFormatted))
    }
  }

  // 7. Call-to-action
  messageParts.push('')
  messageParts.push(msg.cta)

  return messageParts.join('\n')
}

/**
 * Build a payment reminder message
 *
 * Story 4.2: Payment Due Reminder - WhatsApp
 *
 * Message structure:
 * 1. Title
 * 2. Due in X days (date)
 * 3. Total amount
 * 4. Card name
 * 5. Statement period
 * 6. Footer (call-to-action)
 *
 * Awareness-first language:
 * - Neutral title ("Lembrete: Pagamento do cartão" not "WARNING: PAYMENT DUE!")
 * - Informational due date ("Vence em 2 dias" not "URGENT: DUE SOON!")
 * - Factual amount ("Valor: R$ 1.450,00" not "YOU OWE R$ 1,450!")
 * - Friendly footer with emoji ("Não esqueça de realizar o pagamento! 😊")
 *
 * @param user - Eligible user for payment reminder
 * @param statementTotal - Total amount due (transactions + installments)
 * @returns Formatted WhatsApp message
 */
export function buildPaymentReminderMessage(
  user: EligiblePaymentReminder,
  statementTotal: number
): string {
  const locale = user.user_locale || 'pt-BR'

  // Validate supported locales
  const supportedLocales = ['pt-BR', 'pt', 'en']
  if (!supportedLocales.includes(locale)) {
    throw new Error(`Payment reminder messages not found for locale: ${locale}`)
  }

  const msg = getMessages(locale).paymentReminder

  if (!msg) {
    throw new Error(`Payment reminder messages not found for locale: ${locale}`)
  }

  const messageParts: string[] = []

  // 1. Title
  messageParts.push(msg.title)
  messageParts.push('')

  // 2. Due in X days (date)
  const dueDateFormatted = formatClosingDate(user.due_date, locale)
  messageParts.push(msg.dueIn(2, dueDateFormatted))

  // 3. Total amount
  const totalFormatted = formatCurrencyForReminder(statementTotal, locale)
  messageParts.push(msg.amount(totalFormatted))
  messageParts.push('')

  // 4. Card name
  messageParts.push(msg.cardName(user.payment_method_name))

  // 5. Statement period
  const periodFormatted = formatPeriodDates(
    user.statement_period_start,
    user.statement_period_end,
    locale
  )
  messageParts.push(msg.period(periodFormatted.split(' - ')[0], periodFormatted.split(' - ')[1]))
  messageParts.push('')

  // 6. Footer
  messageParts.push(msg.footer)

  return messageParts.join('\n')
}
