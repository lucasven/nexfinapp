import { getSupabaseClient } from '../services/supabase-client.js'
import { getUserSession } from '../auth/session-manager.js'
import { ParsedIntent } from '../types.js'
import { messages, formatDate } from '../localization/pt-br.js'
import { logger } from '../services/logger.js'

interface PendingTransaction {
  whatsappNumber: string
  userId: string
  expenseData: any
  timestamp: number
}

// In-memory storage for pending transactions
// In production, this should be stored in Redis or database
const pendingTransactions = new Map<string, PendingTransaction>()

/**
 * Store a pending transaction that needs confirmation
 */
export function storePendingTransaction(
  whatsappNumber: string,
  userId: string,
  expenseData: any
): void {
  const pending: PendingTransaction = {
    whatsappNumber,
    userId,
    expenseData,
    timestamp: Date.now()
  }
  
  pendingTransactions.set(whatsappNumber, pending)
  
  // Clean up after 5 minutes
  setTimeout(() => {
    pendingTransactions.delete(whatsappNumber)
  }, 5 * 60 * 1000)
}

/**
 * Check if user has a pending transaction
 */
export function hasPendingTransaction(whatsappNumber: string): boolean {
  return pendingTransactions.has(whatsappNumber)
}

/**
 * Get and clear pending transaction
 */
export function getAndClearPendingTransaction(whatsappNumber: string): PendingTransaction | null {
  const pending = pendingTransactions.get(whatsappNumber)
  if (pending) {
    pendingTransactions.delete(whatsappNumber)
    return pending
  }
  return null
}

/**
 * Handle user confirmation for duplicate transaction
 */
export async function handleDuplicateConfirmation(
  whatsappNumber: string,
  message: string
): Promise<string> {
  const session = await getUserSession(whatsappNumber)
  if (!session) {
    return messages.notAuthenticated
  }

  const pending = getAndClearPendingTransaction(whatsappNumber)
  if (!pending) {
    return messages.duplicateConfirmationNotFound
  }

  // Check if user confirmed
  const normalizedMessage = message.toLowerCase().trim()
  const confirmationWords = messages.confirmYes
  
  if (!confirmationWords.some(word => normalizedMessage.includes(word))) {
    return messages.duplicateConfirmationInvalid
  }

  try {
    // Proceed with creating the transaction
    const { amount, category, description, date, type, paymentMethod } = pending.expenseData
    const supabase = getSupabaseClient()

    // Find category ID
    let categoryId = null
    if (category) {
      const { data: categories } = await supabase
        .from('categories')
        .select('id, name')
        .eq('type', type || 'expense')
        .ilike('name', `%${category}%`)
        .limit(1)

      if (categories && categories.length > 0) {
        categoryId = categories[0].id
      }
    }

    // Use default category if not found
    if (!categoryId) {
      const defaultCategoryName = type === 'income' ? 'Other Income' : 'Other Expense'
      const { data: defaultCat } = await supabase
        .from('categories')
        .select('id')
        .eq('name', defaultCategoryName)
        .single()

      if (defaultCat) {
        categoryId = defaultCat.id
      }
    }

    // Create transaction
    const transactionDate = date || new Date().toISOString().split('T')[0]

    // Generate user-readable transaction ID
    const { data: idData, error: idError } = await supabase
      .rpc('generate_transaction_id')

    if (idError) {
      logger.error('Error generating transaction ID:', idError)
      return messages.expenseError
    }

    const userReadableId = idData

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: session.userId,
        amount: amount,
        type: type || 'expense',
        category_id: categoryId,
        description: description || null,
        date: transactionDate,
        payment_method: paymentMethod || null,
        user_readable_id: userReadableId
      })
      .select(`
        *,
        category:categories(name)
      `)
      .single()

    if (error) {
      logger.error('Error creating confirmed transaction:', error)
      return messages.expenseError
    }

    const categoryName = data.category?.name || 'Sem categoria'
    const formattedDate = formatDate(new Date(transactionDate))
    const paymentMethodText = paymentMethod ? `\n💳 Método: ${paymentMethod}` : ''
    const transactionIdText = `\n🆔 ID: ${userReadableId}`

    if (type === 'income') {
      return `${messages.duplicateConfirmed}\n\n${messages.incomeAdded(amount, categoryName, formattedDate)}${paymentMethodText}${transactionIdText}`
    } else {
      return `${messages.duplicateConfirmed}\n\n${messages.expenseAdded(amount, categoryName, formattedDate)}${paymentMethodText}${transactionIdText}`
    }
  } catch (error) {
    logger.error('Error in handleDuplicateConfirmation:', error as Error)
    return messages.expenseError
  }
}
