/**
 * Transaction Management Handler
 * 
 * Handles editing, deleting, and viewing transaction details
 */

import { ParsedIntent } from '../types'
import { getSupabaseClient } from '../services/supabase-client'
import { getUserSession } from '../auth/session-manager'
import { messages } from '../localization/pt-br'
import { logger } from '../services/logger'
import { storeUndoState } from './undo'

/**
 * Edit an existing transaction
 * 
 * @param whatsappNumber - User's WhatsApp number
 * @param intent - Parsed intent with transaction ID and fields to update
 * @returns Success message or error
 */
export async function handleEditTransaction(
  whatsappNumber: string, 
  intent: ParsedIntent
): Promise<string> {
  const { transactionId, amount, category, description, date, paymentMethod } = intent.entities

  if (!transactionId) {
    return '❌ ID da transação não fornecido.'
  }

  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.loginPrompt
    }

    const supabase = getSupabaseClient()

    // Fetch the current transaction
    const { data: transaction, error: fetchError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_readable_id', transactionId)
      .eq('user_id', session.userId)
      .single()

    if (fetchError || !transaction) {
      logger.error('Transaction not found for edit', { transactionId, userId: session.userId })
      return messages.correctionTransactionNotFound(transactionId)
    }

    // Store undo state before making changes
    storeUndoState(whatsappNumber, 'edit_transaction', transaction)

    // Build update object with only provided fields
    const updates: any = {}
    const changedFields: string[] = []

    if (amount !== undefined && amount !== transaction.amount) {
      updates.amount = amount
      changedFields.push(`valor (R$ ${amount.toFixed(2)})`)
    }

    if (category && category !== transaction.category) {
      // Look up category ID (case-insensitive)
      const { data: categoryData } = await supabase
        .from('categories')
        .select('id, name')
        .ilike('name', category)
        .limit(1)
        .single()

      if (categoryData) {
        updates.category_id = categoryData.id
        changedFields.push(`categoria (${categoryData.name})`)
      }
    }

    if (description && description !== transaction.description) {
      updates.description = description
      changedFields.push('descrição')
    }

    if (date && date !== transaction.date) {
      updates.date = date
      changedFields.push('data')
    }

    if (paymentMethod && paymentMethod !== transaction.payment_method) {
      updates.payment_method = paymentMethod
      changedFields.push('método de pagamento')
    }

    // If no changes, return early
    if (Object.keys(updates).length === 0) {
      return messages.correctionNoChanges
    }

    // Update the transaction
    const { error: updateError } = await supabase
      .from('transactions')
      .update(updates)
      .eq('id', transaction.id)

    if (updateError) {
      logger.error('Failed to update transaction', { transactionId, error: updateError })
      return messages.genericError
    }

    logger.info('Transaction edited', {
      whatsappNumber,
      userId: session.userId,
      transactionId,
      changedFields
    })

    return messages.transactionEdited(transactionId, changedFields.join(', '))
  } catch (error) {
    logger.error('Error in handleEditTransaction', { whatsappNumber, transactionId }, error as Error)
    return messages.genericError
  }
}

/**
 * Delete a transaction
 * 
 * @param whatsappNumber - User's WhatsApp number
 * @param transactionId - Transaction ID to delete
 * @returns Success message or error
 */
export async function handleDeleteTransaction(
  whatsappNumber: string, 
  transactionId: string
): Promise<string> {
  if (!transactionId) {
    return '❌ ID da transação não fornecido.'
  }

  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.loginPrompt
    }

    const supabase = getSupabaseClient()

    // Fetch the transaction before deleting (for undo)
    const { data: transaction, error: fetchError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_readable_id', transactionId)
      .eq('user_id', session.userId)
      .single()

    if (fetchError || !transaction) {
      logger.error('Transaction not found for deletion', { transactionId, userId: session.userId })
      return messages.correctionTransactionNotFound(transactionId)
    }

    // Store undo state before deleting
    storeUndoState(whatsappNumber, 'delete_transaction', transaction)

    // Delete the transaction
    const { error: deleteError } = await supabase
      .from('transactions')
      .delete()
      .eq('id', transaction.id)

    if (deleteError) {
      logger.error('Failed to delete transaction', { transactionId, error: deleteError })
      return messages.genericError
    }

    logger.info('Transaction deleted', {
      whatsappNumber,
      userId: session.userId,
      transactionId
    })

    return messages.transactionDeleted(transactionId)
  } catch (error) {
    logger.error('Error in handleDeleteTransaction', { whatsappNumber, transactionId }, error as Error)
    return messages.genericError
  }
}

/**
 * Change the category of a transaction
 * 
 * @param whatsappNumber - User's WhatsApp number
 * @param transactionId - Transaction ID
 * @param newCategory - New category name
 * @returns Success message or error
 */
export async function handleChangeCategory(
  whatsappNumber: string,
  transactionId: string,
  newCategory: string
): Promise<string> {
  if (!transactionId) {
    return '❌ ID da transação não fornecido.'
  }

  if (!newCategory) {
    return '❌ Nova categoria não especificada.'
  }

  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.loginPrompt
    }

    const supabase = getSupabaseClient()

    // Fetch the current transaction
    const { data: transaction, error: fetchError } = await supabase
      .from('transactions')
      .select('*, categories(name)')
      .eq('user_readable_id', transactionId)
      .eq('user_id', session.userId)
      .single()

    if (fetchError || !transaction) {
      logger.error('Transaction not found for category change', { transactionId, userId: session.userId })
      return messages.correctionTransactionNotFound(transactionId)
    }

    // Store undo state before making changes
    storeUndoState(whatsappNumber, 'change_category', transaction)

    // Look up new category (case-insensitive)
    const { data: categoryData } = await supabase
      .from('categories')
      .select('id, name')
      .ilike('name', newCategory)
      .limit(1)
      .single()

    if (!categoryData) {
      return messages.categoryNotFound(newCategory)
    }

    // Update the transaction
    const { error: updateError } = await supabase
      .from('transactions')
      .update({ category_id: categoryData.id })
      .eq('id', transaction.id)

    if (updateError) {
      logger.error('Failed to change category', { transactionId, error: updateError })
      return messages.genericError
    }

    logger.info('Category changed', {
      whatsappNumber,
      userId: session.userId,
      transactionId,
      oldCategory: (transaction as any).categories?.name,
      newCategory: categoryData.name
    })

    return messages.transactionEdited(transactionId, `categoria alterada para ${categoryData.name}`)
  } catch (error) {
    logger.error('Error in handleChangeCategory', { whatsappNumber, transactionId, newCategory }, error as Error)
    return messages.genericError
  }
}

/**
 * Show details of a transaction
 * 
 * @param whatsappNumber - User's WhatsApp number
 * @param transactionId - Transaction ID
 * @returns Transaction details or error
 */
export async function handleShowTransactionDetails(
  whatsappNumber: string,
  transactionId: string
): Promise<string> {
  if (!transactionId) {
    return '❌ ID da transação não fornecido.'
  }

  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.loginPrompt
    }

    const supabase = getSupabaseClient()

    // Fetch the transaction with category info
    const { data: transaction, error } = await supabase
      .from('transactions')
      .select('*, categories(name)')
      .eq('user_readable_id', transactionId)
      .eq('user_id', session.userId)
      .single()

    if (error || !transaction) {
      logger.error('Transaction not found', { transactionId, userId: session.userId })
      return messages.correctionTransactionNotFound(transactionId)
    }

    const categoryName = (transaction as any).categories?.name || 'Sem categoria'
    const date = new Date(transaction.date).toLocaleDateString('pt-BR')

    return messages.transactionDetails(
      transactionId,
      transaction.amount,
      categoryName,
      date
    )
  } catch (error) {
    logger.error('Error in handleShowTransactionDetails', { whatsappNumber, transactionId }, error as Error)
    return messages.genericError
  }
}

