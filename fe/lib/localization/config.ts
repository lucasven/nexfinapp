import type { Locale } from './types'

/**
 * Detect browser locale from Accept-Language header
 */
export function detectBrowserLocale(acceptLanguage?: string): Locale {
  if (!acceptLanguage) return 'pt-br'

  const locale = acceptLanguage.split(',')[0].toLowerCase()

  if (locale.startsWith('pt')) return 'pt-br'
  if (locale.startsWith('en')) return 'en'

  return 'pt-br'
}

/**
 * Validate if a string is a valid locale
 */
export function isValidLocale(locale: string): locale is Locale {
  return locale === 'pt-br' || locale === 'en'
}
