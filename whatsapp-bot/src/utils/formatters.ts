/**
 * Date and Currency Formatting Helpers
 *
 * Provides locale-aware formatting for dates and currency amounts.
 * Used for statement reminders and other localized messages.
 */

import { format, type Locale } from 'date-fns'
import { ptBR, enUS } from 'date-fns/locale'

/**
 * Get date-fns locale object for a given locale code
 */
function getDateFnsLocale(locale: string): Locale {
  if (locale === 'pt-br' || locale === 'pt-BR' || locale === 'pt') {
    return ptBR
  }
  return enUS
}

/**
 * Format closing date in long format
 *
 * pt-BR: "5 de Janeiro"
 * en: "January 5th"
 */
export function formatClosingDate(date: Date, locale: string): string {
  const dateFnsLocale = getDateFnsLocale(locale)

  if (locale === 'pt-br' || locale === 'pt-BR' || locale === 'pt') {
    // Portuguese: "5 de Janeiro"
    return format(date, "d 'de' MMMM", { locale: dateFnsLocale })
  } else {
    // English: "January 5th" (using day without ordinal suffix for simplicity)
    return format(date, 'MMMM do', { locale: dateFnsLocale })
  }
}

/**
 * Format period dates in short format
 *
 * pt-BR: "6 Dez - 5 Jan"
 * en: "Dec 6 - Jan 5"
 */
export function formatPeriodDates(
  startDate: Date,
  endDate: Date,
  locale: string
): string {
  const dateFnsLocale = getDateFnsLocale(locale)

  if (locale === 'pt-br' || locale === 'pt-BR' || locale === 'pt') {
    // Portuguese: "6 Dez - 5 Jan"
    const start = format(startDate, 'd MMM', { locale: dateFnsLocale })
    const end = format(endDate, 'd MMM', { locale: dateFnsLocale })
    return `${start} - ${end}`
  } else {
    // English: "Dec 6 - Jan 5"
    const start = format(startDate, 'MMM d', { locale: dateFnsLocale })
    const end = format(endDate, 'MMM d', { locale: dateFnsLocale })
    return `${start} - ${end}`
  }
}

/**
 * Format currency amount with locale-aware formatting
 *
 * pt-BR: "R$ 1.700,00" (comma for decimals, period for thousands)
 * en: "R$ 1,700.00" (period for decimals, comma for thousands)
 */
export function formatCurrencyForReminder(amount: number, locale: string): string {
  if (locale === 'pt-br' || locale === 'pt-BR' || locale === 'pt') {
    // Portuguese formatting: R$ 1.700,00
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(amount)
  } else {
    // English formatting: R$ 1,700.00
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'BRL',
    }).format(amount)
  }
}

/**
 * Get the number of days between two dates
 */
export function getDaysDifference(date1: Date, date2: Date): number {
  const diffTime = Math.abs(date2.getTime() - date1.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}
