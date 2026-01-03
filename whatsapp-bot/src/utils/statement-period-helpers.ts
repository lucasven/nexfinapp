/**
 * Statement Period Calculation Helpers for WhatsApp Bot
 *
 * Mirrors functionality from fe/lib/utils/statement-period.ts
 * Provides statement period calculation for WhatsApp confirmation messages
 *
 * Story 3.6: Current vs Next Statement Distinction
 */

export interface StatementPeriod {
  periodStart: Date
  periodEnd: Date
}

export type StatementPeriodType = 'current' | 'next' | 'past'

export interface StatementPeriodInfo {
  period: StatementPeriodType
  periodStart: Date
  periodEnd: Date
}

/**
 * Get the statement period for a given date and closing day
 *
 * @param currentDate The date to calculate the statement period for (default: today)
 * @param closingDay The day of the month when the statement closes (default: 5)
 * @returns Object with periodStart and periodEnd dates
 */
export function getStatementPeriod(
  currentDate: Date = new Date(),
  closingDay: number = 5
): StatementPeriod {
  const day = currentDate.getDate()
  const month = currentDate.getMonth()
  const year = currentDate.getFullYear()

  let periodStart: Date
  let periodEnd: Date

  if (day <= closingDay) {
    // Before or on closing day: current period ends this month
    // Period: (prev month, closingDay + 1) to (this month, closingDay)
    periodEnd = new Date(year, month, closingDay)

    // Start is closingDay + 1 of previous month
    // Date constructor handles overflow automatically (e.g., Feb 31 → Mar 3)
    periodStart = new Date(year, month - 1, closingDay + 1)
  } else {
    // After closing day: current period ends next month
    // Period: (this month, closingDay + 1) to (next month, closingDay)
    periodStart = new Date(year, month, closingDay + 1)
    periodEnd = new Date(year, month + 1, closingDay)
  }

  return {
    periodStart,
    periodEnd,
  }
}

/**
 * Check if a date is within a statement period
 */
export function isDateInPeriod(date: Date, period: StatementPeriod): boolean {
  const dateTime = date.getTime()
  const startTime = period.periodStart.getTime()
  const endTime = period.periodEnd.getTime()

  return dateTime >= startTime && dateTime <= endTime
}

/**
 * Determine which statement period a transaction date belongs to
 *
 * @param closingDay The day of the month when the statement closes
 * @param transactionDate The date of the transaction
 * @param referenceDate The reference date (default: today) used to calculate current period
 * @returns Object with period classification (current/next/past) and boundaries
 */
export function getStatementPeriodForDate(
  closingDay: number,
  transactionDate: Date,
  referenceDate: Date = new Date()
): StatementPeriodInfo {
  // Get current period based on reference date
  const currentPeriod = getStatementPeriod(referenceDate, closingDay)

  // Check if transaction is in current period
  if (isDateInPeriod(transactionDate, currentPeriod)) {
    return {
      period: 'current',
      periodStart: currentPeriod.periodStart,
      periodEnd: currentPeriod.periodEnd,
    }
  }

  // Calculate next period (starts day after current period ends)
  const nextPeriodStart = new Date(currentPeriod.periodEnd)
  nextPeriodStart.setDate(nextPeriodStart.getDate() + 1)
  const nextPeriod = getStatementPeriod(nextPeriodStart, closingDay)

  // Check if transaction is in next period
  if (isDateInPeriod(transactionDate, nextPeriod)) {
    return {
      period: 'next',
      periodStart: nextPeriod.periodStart,
      periodEnd: nextPeriod.periodEnd,
    }
  }

  // If transaction is before current period, it's in a past period
  if (transactionDate < currentPeriod.periodStart) {
    const pastPeriod = getStatementPeriod(transactionDate, closingDay)
    return {
      period: 'past',
      periodStart: pastPeriod.periodStart,
      periodEnd: pastPeriod.periodEnd,
    }
  }

  // If transaction is after next period, treat as 'next'
  const futurePeriod = getStatementPeriod(transactionDate, closingDay)
  return {
    period: 'next',
    periodStart: futurePeriod.periodStart,
    periodEnd: futurePeriod.periodEnd,
  }
}

/**
 * Format statement period date for WhatsApp message
 *
 * @param date The date to format
 * @param locale The locale to use for formatting ('pt-BR' or 'en-US')
 * @param short Whether to use short format (true = "6 Dez", false = "6 de dezembro")
 * @returns Formatted date string
 */
export function formatStatementPeriod(
  date: Date,
  locale: string = 'pt-BR',
  short: boolean = false
): string {
  const day = date.getDate()

  if (short) {
    // Short format: "6 Dez" or "Dec 6"
    const month = date.toLocaleDateString(locale, { month: 'short' })
    if (locale === 'pt-br' || locale === 'pt-BR') {
      return `${day} ${month}`
    } else {
      return `${month} ${day}`
    }
  } else {
    // Long format: "6 de dezembro" or "December 6"
    const month = date.toLocaleDateString(locale, { month: 'long' })
    if (locale === 'pt-br' || locale === 'pt-BR') {
      return `${day} de ${month}`
    } else {
      return `${month} ${day}`
    }
  }
}
