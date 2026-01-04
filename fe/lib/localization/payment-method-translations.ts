import type { Locale } from './types'
import { isPortuguese } from './config'

/**
 * Payment Method Name Translations
 *
 * Maps known English payment method names to Portuguese equivalents.
 * Used to display migrated or system-created payment methods in the user's locale.
 */

// Map of English names to Portuguese translations
const paymentMethodTranslations: Record<string, string> = {
  // Migrated payment methods
  'Cash': 'Dinheiro',
  'Cash (Migrated)': 'Dinheiro (Migrado)',
  'Unspecified': 'Não Especificado',
  'Unspecified (Migrated)': 'Não Especificado (Migrado)',

  // Common payment method types
  'Credit Card': 'Cartão de Crédito',
  'Debit Card': 'Cartão de Débito',
  'Bank Transfer': 'Transferência Bancária',
  'PIX': 'PIX',
  'Other': 'Outro',

  // With suffixes
  'Credit Card (Migrated)': 'Cartão de Crédito (Migrado)',
  'Debit Card (Migrated)': 'Cartão de Débito (Migrado)',
}

// Reverse map for English display
const reverseTranslations: Record<string, string> = Object.entries(paymentMethodTranslations)
  .reduce((acc, [en, pt]) => {
    acc[pt] = en
    return acc
  }, {} as Record<string, string>)

/**
 * Translate a payment method name to the user's locale
 *
 * @param name The payment method name (may be in English or Portuguese)
 * @param locale The target locale ('pt-br' or 'en')
 * @returns Translated name, or original if no translation found
 *
 * @example
 * translatePaymentMethodName('Cash (Migrated)', 'pt-br') // 'Dinheiro (Migrado)'
 * translatePaymentMethodName('Dinheiro (Migrado)', 'en') // 'Cash (Migrated)'
 * translatePaymentMethodName('My Custom Card', 'pt-br') // 'My Custom Card' (unchanged)
 */
export function translatePaymentMethodName(name: string, locale: Locale | string): string {
  if (isPortuguese(locale)) {
    // Translate English → Portuguese
    return paymentMethodTranslations[name] || name
  } else {
    // Translate Portuguese → English (or keep as-is)
    return reverseTranslations[name] || name
  }
}

/**
 * Check if a payment method name is a known translatable name
 */
export function isTranslatablePaymentMethod(name: string): boolean {
  return name in paymentMethodTranslations || name in reverseTranslations
}
