import type { Locale } from './types'
import { messages as ptBrMessages } from './pt-br'
import { messages as enMessages } from './en'

// Map of default category names (in any language) to their translation key
const defaultCategoryMap: Record<string, keyof typeof ptBrMessages.categories> = {
  // English names
  'Salary': 'salary',
  'Freelance': 'freelance',
  'Investments': 'investments',
  'Other': 'other',
  'Food': 'food',
  'Transport': 'transport',
  'Housing': 'housing',
  'Utilities': 'utilities',
  'Entertainment': 'entertainment',
  'Healthcare': 'healthcare',
  'Education': 'education',
  'Shopping': 'shopping',
  
  // Portuguese names
  'Salário': 'salary',
  'Investimentos': 'investments',
  'Outro': 'other',
  'Alimentação': 'food',
  'Transporte': 'transport',
  'Moradia': 'housing',
  'Contas': 'utilities',
  'Entretenimento': 'entertainment',
  'Saúde': 'healthcare',
  'Educação': 'education',
  'Compras': 'shopping',
}

/**
 * Translate a category name if it's a default category
 * Returns the original name if it's a custom category
 */
export function translateCategoryName(name: string, locale: Locale): string {
  const translationKey = defaultCategoryMap[name]
  
  if (!translationKey) {
    // Custom category, return original name
    return name
  }
  
  // Return translated name
  const messages = locale === 'pt-br' ? ptBrMessages : enMessages
  return messages.categories[translationKey]
}

/**
 * Check if a category is a default (non-custom) category
 */
export function isDefaultCategory(name: string): boolean {
  return name in defaultCategoryMap
}
