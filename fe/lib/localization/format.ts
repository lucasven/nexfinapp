import type { Locale } from './types'

/**
 * Format a number as currency based on locale
 */
export function formatCurrency(value: number, locale: Locale): string {
  if (locale === 'pt-br') {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value)
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

/**
 * Format a date based on locale
 */
export function formatDate(date: Date | string, locale: Locale): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date

  if (locale === 'pt-br') {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(dateObj)
  }

  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(dateObj)
}

/**
 * Format a number with thousand separators based on locale
 */
export function formatNumber(value: number, locale: Locale): string {
  if (locale === 'pt-br') {
    return new Intl.NumberFormat('pt-BR').format(value)
  }

  return new Intl.NumberFormat('en-US').format(value)
}

/**
 * Get the localized month name
 */
export function getMonthName(month: number, locale: Locale): string {
  const monthNamesPtBr = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ]

  const monthNamesEn = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]

  const monthNames = locale === 'pt-br' ? monthNamesPtBr : monthNamesEn
  return monthNames[month - 1] || ''
}

/**
 * Get the currency symbol based on locale
 */
export function getCurrencySymbol(locale: Locale): string {
  return locale === 'pt-br' ? 'R$' : '$'
}
