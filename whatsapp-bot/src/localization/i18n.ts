/**
 * Core internationalization (i18n) system
 * 
 * This module provides locale detection, translation functions, and format helpers
 * for multi-language support in the WhatsApp bot.
 */

import { Locale, Messages, FormatHelpers } from './types'
import { messages as ptBrMessages, formatHelpers as ptBrFormatHelpers } from './pt-br'
import { messages as enMessages, formatHelpers as enFormatHelpers } from './en'
import { getSupabaseClient } from '../services/supabase-client'

const DEFAULT_LOCALE: Locale = 'pt-br'

// Store locale messages
const localeMessages: Record<Locale, Messages> = {
  'pt-br': ptBrMessages,
  'en': enMessages
}

// Store format helpers
const localeFormatHelpers: Record<Locale, FormatHelpers> = {
  'pt-br': ptBrFormatHelpers,
  'en': enFormatHelpers
}

// Cache user locales to avoid repeated database queries
const userLocaleCache = new Map<string, Locale>()

/**
 * Get user's preferred locale from database
 * Falls back to default locale if not found
 */
export async function getUserLocale(userId: string): Promise<Locale> {
  // Check cache first
  if (userLocaleCache.has(userId)) {
    return userLocaleCache.get(userId)!
  }

  try {
    const supabase = getSupabaseClient()
    const { data } = await supabase
      .from('user_profiles')
      .select('locale')
      .eq('user_id', userId)
      .single()

    const locale = (data?.locale as Locale) || DEFAULT_LOCALE
    userLocaleCache.set(userId, locale)
    return locale
  } catch (error) {
    console.error('Error fetching user locale:', error)
    return DEFAULT_LOCALE
  }
}

/**
 * Set user's preferred locale in database
 */
export async function setUserLocale(userId: string, locale: Locale): Promise<void> {
  try {
    const supabase = getSupabaseClient()
    await supabase
      .from('user_profiles')
      .update({ locale })
      .eq('user_id', userId)

    // Update cache
    userLocaleCache.set(userId, locale)
  } catch (error) {
    console.error('Error setting user locale:', error)
  }
}

/**
 * Clear user locale from cache (useful after logout or for testing)
 */
export function clearUserLocaleCache(userId: string): void {
  userLocaleCache.delete(userId)
}

/**
 * Get messages object for a specific locale
 */
export function getMessages(locale: Locale = DEFAULT_LOCALE): Messages {
  return localeMessages[locale] || localeMessages[DEFAULT_LOCALE]
}

/**
 * Get format helpers for a specific locale
 */
export function getFormatHelpers(locale: Locale = DEFAULT_LOCALE): FormatHelpers {
  return localeFormatHelpers[locale] || localeFormatHelpers[DEFAULT_LOCALE]
}

/**
 * Translate a message key to the user's locale
 * 
 * @param key - Message key to translate
 * @param locale - Target locale (defaults to pt-br)
 * @param params - Parameters for message functions
 * @returns Translated message
 */
export function t(
  key: keyof Messages,
  locale: Locale = DEFAULT_LOCALE,
  ...params: any[]
): string | string[] | Record<string, string | string[]> {
  const messages = getMessages(locale)
  const message = messages[key]

  if (typeof message === 'function') {
    return (message as (...args: any[]) => string | string[])(...params)
  }

  return message as any
}

/**
 * Format currency according to locale
 */
export function formatCurrency(value: number, locale: Locale = DEFAULT_LOCALE): string {
  const helpers = getFormatHelpers(locale)
  return helpers.formatCurrency(value)
}

/**
 * Format date according to locale
 */
export function formatDate(date: Date, locale: Locale = DEFAULT_LOCALE): string {
  const helpers = getFormatHelpers(locale)
  return helpers.formatDate(date)
}

/**
 * Get month name according to locale
 */
export function getMonthName(month: number, locale: Locale = DEFAULT_LOCALE): string {
  const helpers = getFormatHelpers(locale)
  return helpers.getMonthName(month)
}

/**
 * Get all available locales
 */
export function getAvailableLocales(): Locale[] {
  return Object.keys(localeMessages) as Locale[]
}

/**
 * Check if a locale is supported
 */
export function isLocaleSupported(locale: string): locale is Locale {
  return locale in localeMessages
}

