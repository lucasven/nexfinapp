import { getSupabaseClient } from '../../services/database/supabase-client.js'
import { getUserSession } from '../../auth/session-manager.js'
import { ParsedIntent } from '../../types.js'
import { messages, formatDate } from '../../localization/pt-br.js'
import { logger } from '../../services/monitoring/logger.js'

/**
 * Check if a quoted message contains a duplicate ID
 */
export function isDuplicateReply(quotedMessage: string): boolean {
  return /(?:🆔\s*)?Duplicate\s*ID:\s*([A-Z0-9]{6})/i.test(quotedMessage)
}

/**
 * Extract duplicate ID from quoted message
 */
export function extractDuplicateIdFromQuote(quotedMessage: string): string | null {
  const match = quotedMessage.match(/(?:🆔\s*)?Duplicate\s*ID:\s*([A-Z0-9]{6})/i)
  return match ? match[1] : null
}

interface PendingTransaction {
  duplicateId: string  // Unique ID for this duplicate confirmation
  whatsappNumber: string
  userId: string
  expenseData: any
  timestamp: number
}

// In-memory storage for pending transactions
// In production, this should be stored in Redis or database
// Key format: "whatsappNumber:duplicateId" to support multiple pending duplicates per user
const pendingTransactions = new Map<string, PendingTransaction>()

/**
 * Generate a unique 6-character duplicate ID
 */
function generateDuplicateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let id = ''
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return id
}

/**
 * Store a pending transaction that needs confirmation
 * @returns The duplicate ID to include in the bot message
 */
export function storePendingTransaction(
  whatsappNumber: string,
  userId: string,
  expenseData: any
): string {
  const duplicateId = generateDuplicateId()
  const key = `${whatsappNumber}:${duplicateId}`

  const pending: PendingTransaction = {
    duplicateId,
    whatsappNumber,
    userId,
    expenseData,
    timestamp: Date.now()
  }

  pendingTransactions.set(key, pending)

  // Clean up after 5 minutes
  setTimeout(() => {
    pendingTransactions.delete(key)
  }, 5 * 60 * 1000)

  return duplicateId
}

/**
 * Check if user has ANY pending transactions
 */
export function hasPendingTransaction(whatsappNumber: string): boolean {
  // Check if any key starts with this whatsapp number
  for (const key of pendingTransactions.keys()) {
    if (key.startsWith(`${whatsappNumber}:`)) {
      return true
    }
  }
  return false
}

/**
 * Get and clear specific pending transaction by duplicate ID
 */
export function getAndClearPendingTransaction(
  whatsappNumber: string,
  duplicateId?: string
): PendingTransaction | null {
  if (duplicateId) {
    // Get specific duplicate by ID
    const key = `${whatsappNumber}:${duplicateId}`
    const pending = pendingTransactions.get(key)
    if (pending) {
      pendingTransactions.delete(key)
      return pending
    }
    return null
  } else {
    // Fallback: Get the oldest pending transaction for this user
    // This handles old messages without duplicate IDs
    let oldestPending: PendingTransaction | null = null
    let oldestKey: string | null = null

    for (const [key, pending] of pendingTransactions.entries()) {
      if (key.startsWith(`${whatsappNumber}:`)) {
        if (!oldestPending || pending.timestamp < oldestPending.timestamp) {
          oldestPending = pending
          oldestKey = key
        }
      }
    }

    if (oldestKey && oldestPending) {
      pendingTransactions.delete(oldestKey)
      return oldestPending
    }

    return null
  }
}

/**
 * Handle user confirmation for duplicate transaction
 * @param duplicateId Optional - specific duplicate to confirm (from reply)
 */
export async function handleDuplicateConfirmation(
  whatsappNumber: string,
  message: string,
  duplicateId?: string
): Promise<string> {
  const session = await getUserSession(whatsappNumber)
  if (!session) {
    return messages.notAuthenticated
  }

  const pending = getAndClearPendingTransaction(whatsappNumber, duplicateId)
  if (!pending) {
    if (duplicateId) {
      return `❌ Confirmação de duplicata ${duplicateId} não encontrada ou expirou.`
    }
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

    // Find category ID (only user's categories and defaults)
    let categoryId = null
    if (category) {
      const { data: categories } = await supabase
        .from('categories')
        .select('id, name')
        .eq('type', type || 'expense')
        .or(`user_id.is.null,user_id.eq.${session.userId}`)
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
        .is('user_id', null)
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
