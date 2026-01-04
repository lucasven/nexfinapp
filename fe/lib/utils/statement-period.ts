/**
 * Statement Period Calculation Utility
 *
 * Calculates the statement period for credit card budgets based on closing date.
 *
 * TODO Epic 3: Read closingDay from payment_methods table
 * Currently hardcoded to 5 (common Brazilian credit card closing date)
 *
 * Epic 3 Story 3.1 will enhance this with:
 * - User-defined closing dates per payment method
 * - closing_day column in payment_methods table
 * - UI to customize closing date
 *
 * Example:
 * - Closing day = 5
 * - Current date = Dec 10, 2024
 * - Statement period = Dec 6, 2024 - Jan 5, 2025
 *
 * Edge cases handled:
 * - Month boundaries (Dec 31 → Jan 1)
 * - Year boundaries (Dec 31, 2024 → Jan 1, 2025)
 * - Short months (Feb 28/29, months with 30 days)
 * - Leap years
 */

import { isPortuguese, toIntlLocale, LOCALE } from '@/lib/localization/config'

export interface StatementPeriod {
  periodStart: Date
  periodEnd: Date
}

/**
 * Get the statement period for a given date and closing day
 *
 * @param currentDate The date to calculate the statement period for (default: today)
 * @param closingDay The day of the month when the statement closes (default: 5)
 * @returns Object with periodStart and periodEnd dates
 *
 * @example
 * // Current date: Dec 3, 2024, Closing day: 5
 * getStatementPeriod(new Date('2024-12-03'), 5)
 * // Returns: { periodStart: Nov 6, 2024, periodEnd: Dec 5, 2024 }
 *
 * @example
 * // Current date: Dec 10, 2024, Closing day: 5
 * getStatementPeriod(new Date('2024-12-10'), 5)
 * // Returns: { periodStart: Dec 6, 2024, periodEnd: Jan 5, 2025 }
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
 * Format statement period as human-readable string
 *
 * @param period The statement period to format
 * @param locale The routing locale ('pt-br' or 'en'), will be converted internally
 * @returns Formatted string like "6 de dezembro - 5 de janeiro de 2025"
 */
export function formatStatementPeriod(
  period: StatementPeriod,
  locale: string = LOCALE.PT_BR
): string {
  const { periodStart, periodEnd } = period
  const intlLocale = toIntlLocale(locale)

  const startDay = periodStart.getDate()
  const endDay = periodEnd.getDate()

  const startMonth = periodStart.toLocaleDateString(intlLocale, { month: 'long' })
  const endMonth = periodEnd.toLocaleDateString(intlLocale, { month: 'long' })

  const startYear = periodStart.getFullYear()
  const endYear = periodEnd.getFullYear()

  // If same year
  if (startYear === endYear) {
    if (isPortuguese(locale)) {
      return `${startDay} de ${startMonth} - ${endDay} de ${endMonth} de ${endYear}`
    } else {
      return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${endYear}`
    }
  } else {
    // Different years
    if (isPortuguese(locale)) {
      return `${startDay} de ${startMonth} de ${startYear} - ${endDay} de ${endMonth} de ${endYear}`
    } else {
      return `${startMonth} ${startDay}, ${startYear} - ${endMonth} ${endDay}, ${endYear}`
    }
  }
}

/**
 * Check if a date is within a statement period
 *
 * @param date The date to check
 * @param period The statement period
 * @returns True if the date is within the period (inclusive)
 */
export function isDateInPeriod(date: Date, period: StatementPeriod): boolean {
  const dateTime = date.getTime()
  const startTime = period.periodStart.getTime()
  const endTime = period.periodEnd.getTime()

  return dateTime >= startTime && dateTime <= endTime
}

/**
 * Statement period classification for badge display
 */
export type StatementPeriodType = 'current' | 'next' | 'past'

export interface StatementPeriodInfo {
  period: StatementPeriodType
  periodStart: Date
  periodEnd: Date
}

/**
 * Determine which statement period a transaction date belongs to
 *
 * @param closingDay The day of the month when the statement closes
 * @param transactionDate The date of the transaction
 * @param referenceDate The reference date (default: today) used to calculate current period
 * @returns Object with period classification (current/next/past) and boundaries
 *
 * @example
 * // Closing day: 5, Reference: Dec 10, 2024, Transaction: Dec 8, 2024
 * getStatementPeriodForDate(5, new Date('2024-12-08'), new Date('2024-12-10'))
 * // Returns: { period: 'current', periodStart: Dec 6, 2024, periodEnd: Jan 5, 2025 }
 *
 * @example
 * // Closing day: 5, Reference: Dec 10, 2024, Transaction: Jan 10, 2025
 * getStatementPeriodForDate(5, new Date('2025-01-10'), new Date('2024-12-10'))
 * // Returns: { period: 'next', periodStart: Jan 6, 2025, periodEnd: Feb 5, 2025 }
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
    // Calculate the past period the transaction belongs to
    const pastPeriod = getStatementPeriod(transactionDate, closingDay)
    return {
      period: 'past',
      periodStart: pastPeriod.periodStart,
      periodEnd: pastPeriod.periodEnd,
    }
  }

  // If transaction is after next period, it's in a future period
  // Treat as 'next' for simplicity (or could be 'future')
  const futurePeriod = getStatementPeriod(transactionDate, closingDay)
  return {
    period: 'next',
    periodStart: futurePeriod.periodStart,
    periodEnd: futurePeriod.periodEnd,
  }
}

/**
 * Transaction with payment method info for badge calculation
 */
export interface TransactionWithPaymentMethod {
  id: string
  date: Date
  payment_method_id: string
  payment_method?: {
    credit_mode?: boolean
    statement_closing_day?: number | null
  }
}

/**
 * Badge information for a transaction
 */
export interface TransactionBadgeInfo {
  transactionId: string
  period: StatementPeriodType
  periodStart: Date
  periodEnd: Date
  shouldDisplay: boolean // Whether to show badge (Credit Mode with closing day set)
}

/**
 * Calculate statement period badges for multiple transactions (batch operation)
 *
 * Performance optimized:
 * - Groups transactions by payment method
 * - Calculates period boundaries once per payment method
 * - Caches boundaries in Map for efficient lookups
 * - Target: < 100ms for 50 transactions
 *
 * @param transactions Array of transactions with payment method info
 * @param referenceDate The reference date (default: today) used to calculate current period
 * @returns Map of transaction ID to badge info
 *
 * @example
 * const transactions = [
 *   { id: '1', date: new Date('2024-12-08'), payment_method_id: 'pm1',
 *     payment_method: { credit_mode: true, statement_closing_day: 5 } },
 *   { id: '2', date: new Date('2024-12-15'), payment_method_id: 'pm1',
 *     payment_method: { credit_mode: true, statement_closing_day: 5 } },
 * ]
 * const badges = getBadgesForTransactions(transactions)
 * // Returns Map with badge info for each transaction
 */
export function getBadgesForTransactions(
  transactions: TransactionWithPaymentMethod[],
  referenceDate: Date = new Date()
): Map<string, TransactionBadgeInfo> {
  const badgeMap = new Map<string, TransactionBadgeInfo>()

  // Cache period boundaries by payment method ID
  const periodCache = new Map<
    string,
    {
      current: StatementPeriod
      next: StatementPeriod
      closingDay: number
    }
  >()

  // Group transactions by payment method for efficient batch processing
  const transactionsByPaymentMethod = new Map<
    string,
    TransactionWithPaymentMethod[]
  >()

  for (const transaction of transactions) {
    const paymentMethodId = transaction.payment_method_id
    if (!transactionsByPaymentMethod.has(paymentMethodId)) {
      transactionsByPaymentMethod.set(paymentMethodId, [])
    }
    transactionsByPaymentMethod.get(paymentMethodId)!.push(transaction)
  }

  // Process each payment method group
  for (const [paymentMethodId, pmTransactions] of transactionsByPaymentMethod) {
    // Get payment method info from first transaction in group
    const firstTransaction = pmTransactions[0]
    const paymentMethod = firstTransaction.payment_method

    // Check if badge should be displayed (Credit Mode with closing day set)
    const shouldDisplay =
      paymentMethod?.credit_mode === true &&
      paymentMethod?.statement_closing_day != null

    if (!shouldDisplay) {
      // Add badge info with shouldDisplay=false for all transactions
      for (const transaction of pmTransactions) {
        badgeMap.set(transaction.id, {
          transactionId: transaction.id,
          period: 'current', // Default, won't be displayed
          periodStart: new Date(),
          periodEnd: new Date(),
          shouldDisplay: false,
        })
      }
      continue
    }

    const closingDay = paymentMethod!.statement_closing_day!

    // Calculate and cache period boundaries for this payment method
    if (!periodCache.has(paymentMethodId)) {
      const currentPeriod = getStatementPeriod(referenceDate, closingDay)
      const nextPeriodStart = new Date(currentPeriod.periodEnd)
      nextPeriodStart.setDate(nextPeriodStart.getDate() + 1)
      const nextPeriod = getStatementPeriod(nextPeriodStart, closingDay)

      periodCache.set(paymentMethodId, {
        current: currentPeriod,
        next: nextPeriod,
        closingDay,
      })
    }

    const cached = periodCache.get(paymentMethodId)!

    // Apply badge logic to all transactions in this payment method group
    for (const transaction of pmTransactions) {
      const periodInfo = getStatementPeriodForDate(
        cached.closingDay,
        transaction.date,
        referenceDate
      )

      badgeMap.set(transaction.id, {
        transactionId: transaction.id,
        period: periodInfo.period,
        periodStart: periodInfo.periodStart,
        periodEnd: periodInfo.periodEnd,
        shouldDisplay: true,
      })
    }
  }

  return badgeMap
}
