/**
 * Payment Due Date Calculation Utility
 *
 * Calculates payment due dates for Credit Mode credit cards based on
 * statement closing day and payment due day (days after closing).
 *
 * Story 4.1: Set Payment Due Date
 * Epic 4: Payment Reminders & Auto-Accounting
 *
 * Example:
 * - Closing day = 5
 * - Payment due day = 10
 * - Payment due on 15th of each month (5 + 10 = 15)
 *
 * Edge cases handled:
 * - Closing day 25 + Due day 10 = 35 → Due on 5th of next month
 * - Closing day 31 + Due day 10 in Feb → Due on Mar 10 (31 adjusted to 28/29, then + 10)
 * - Month boundaries (Nov 25 + 10 = Dec 5)
 * - Year boundaries (Dec 25 + 10 = Jan 5 of next year)
 */

import { getStatementPeriod } from './statement-period'

/**
 * Payment due date information
 */
export interface PaymentDueDateInfo {
  nextDueDate: Date
  dueDay: number
  dueMonth: number
  dueYear: number
}

/**
 * Calculate the next payment due date
 *
 * Logic:
 * 1. Calculate the next statement closing date using getStatementPeriod
 * 2. Add paymentDueDay to the closing date
 * 3. Handle month boundaries (e.g., Nov 25 + 10 = Dec 5)
 * 4. Handle year boundaries (e.g., Dec 25 + 10 = Jan 5 of next year)
 *
 * @param closingDay Day of the month when statement closes (1-31)
 * @param paymentDueDay Days after closing when payment is due (1-60)
 * @param referenceDate The reference date (default: today)
 * @returns Object with next due date and components
 *
 * @example
 * // Closing day 5, Payment due day 10, Reference: Dec 1, 2024
 * calculatePaymentDueDate(5, 10, new Date('2024-12-01'))
 * // Returns: { nextDueDate: Dec 15, 2024, dueDay: 15, dueMonth: 12, dueYear: 2024 }
 *
 * @example
 * // Closing day 25, Payment due day 10, Reference: Dec 1, 2024
 * calculatePaymentDueDate(25, 10, new Date('2024-12-01'))
 * // Returns: { nextDueDate: Jan 4, 2025, dueDay: 4, dueMonth: 1, dueYear: 2025 }
 */
export function calculatePaymentDueDate(
  closingDay: number,
  paymentDueDay: number,
  referenceDate: Date = new Date()
): PaymentDueDateInfo {
  // Get the current statement period to determine next closing date
  const period = getStatementPeriod(referenceDate, closingDay)

  // The next closing date is the end of the current period
  const nextClosingDate = new Date(period.periodEnd)

  // Add payment due days to the closing date
  // JavaScript Date handles month/year boundaries automatically
  const nextDueDate = new Date(nextClosingDate)
  nextDueDate.setDate(nextClosingDate.getDate() + paymentDueDay)

  return {
    nextDueDate,
    dueDay: nextDueDate.getDate(),
    dueMonth: nextDueDate.getMonth() + 1, // Convert from 0-indexed to 1-indexed
    dueYear: nextDueDate.getFullYear(),
  }
}

/**
 * Format payment due date as human-readable string
 *
 * @param dueDate The payment due date to format
 * @param locale The locale to use for formatting (default: 'pt-BR')
 * @returns Formatted string like "15 de janeiro de 2025" or "Jan 15, 2025"
 */
export function formatPaymentDueDate(
  dueDate: Date,
  locale: string = 'pt-BR'
): string {
  const day = dueDate.getDate()
  const month = dueDate.toLocaleDateString(locale, { month: 'long' })
  const year = dueDate.getFullYear()

  if (locale === 'pt-BR') {
    return `${day} de ${month} de ${year}`
  } else {
    return `${month} ${day}, ${year}`
  }
}

/**
 * Get the ordinal suffix for a day number (English only)
 *
 * @param day The day of the month (1-31)
 * @returns Ordinal suffix like "st", "nd", "rd", "th"
 *
 * @example
 * getOrdinalSuffix(1) // "st"
 * getOrdinalSuffix(2) // "nd"
 * getOrdinalSuffix(3) // "rd"
 * getOrdinalSuffix(15) // "th"
 * getOrdinalSuffix(21) // "st"
 */
export function getOrdinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) {
    return 'th'
  }

  switch (day % 10) {
    case 1:
      return 'st'
    case 2:
      return 'nd'
    case 3:
      return 'rd'
    default:
      return 'th'
  }
}

/**
 * Format payment due day with ordinal suffix for preview messages
 *
 * @param day The day of the month (1-31)
 * @param locale The locale (default: 'pt-BR')
 * @returns Formatted string like "15" (pt-BR) or "15th" (en)
 */
export function formatDueDay(day: number, locale: string = 'pt-BR'): string {
  if (locale === 'pt-BR') {
    return `${day}`
  } else {
    return `${day}${getOrdinalSuffix(day)}`
  }
}

/**
 * Calculate the recurring payment due day of the month
 *
 * This is different from calculatePaymentDueDate which returns the next
 * specific due date. This function returns which day of the month the
 * payment will typically be due.
 *
 * Edge cases:
 * - Closing day 5 + Due day 10 = 15 (same month)
 * - Closing day 25 + Due day 10 = 35 → 5 (next month, wraps around)
 *
 * @param closingDay Day of the month when statement closes (1-31)
 * @param paymentDueDay Days after closing when payment is due (1-60)
 * @returns The typical day of the month when payment is due
 *
 * @example
 * calculateRecurringDueDay(5, 10) // Returns 15
 * calculateRecurringDueDay(25, 10) // Returns 5 (wraps to next month)
 */
export function calculateRecurringDueDay(
  closingDay: number,
  paymentDueDay: number
): number {
  // Simple case: closing day + payment due day within same month
  const sumDay = closingDay + paymentDueDay

  if (sumDay <= 31) {
    return sumDay
  }

  // Edge case: wraps to next month
  // Use a reference date to calculate accurately
  const referenceDate = new Date(2024, 0, 1) // Jan 1, 2024 (arbitrary)
  const dueInfo = calculatePaymentDueDate(closingDay, paymentDueDay, referenceDate)
  return dueInfo.dueDay
}
