/**
 * Transaction Management Handler
 * 
 * Handles editing, deleting, and viewing transaction details
 */

import { ParsedIntent } from '../../types.js'
import { getSupabaseClient } from '../../services/database/supabase-client.js'
import { getUserSession } from '../../auth/session-manager.js'
import { messages } from '../../localization/pt-br.js'
import { logger } from '../../services/monitoring/logger.js'
import { storeUndoState } from '../core/undo.js'
import { trackTierAction } from '../../services/onboarding/tier-tracker.js'
import { trackEvent } from '../../analytics/index.js'
import { WhatsAppAnalyticsEvent } from '../../analytics/events.js'
import { findCategoryWithFallback } from '../../services/category-matcher.js'

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
  const { transactionId, amount, category, description, date, paymentMethod, type } = intent.entities

  if (!transactionId) {
    return '❌ ID da transação não fornecido.'
  }

  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.loginPrompt
    }

    const supabase = getSupabaseClient()

    // Fetch the current transaction with category info for type mismatch detection
    const { data: transaction, error: fetchError } = await supabase
      .from('transactions')
      .select('*, categories(id, name, type)')
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
      // Look up category ID (case-insensitive, only user's categories and defaults)
      const { data: categoryData } = await supabase
        .from('categories')
        .select('id, name')
        .or(`user_id.is.null,user_id.eq.${session.userId}`)
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

    // Story 8.3: Handle category mismatch when changing type (AC-8.3.1, AC-8.3.2)
    if (type && type !== transaction.type) {
      updates.type = type
      changedFields.push(messages.transactionTypeChanged(transaction.type, type))

      // Check if current category type matches new transaction type
      const currentCategory = (transaction as any).categories
      if (currentCategory && currentCategory.type !== type) {
        // Category type mismatch detected - find replacement category
        // Story 8.3: Prefer user's custom categories, fallback to defaults (AC-8.3.3, AC-8.3.4)
        const replacementCategory = await findCategoryWithFallback(undefined, {
          userId: session.userId,
          type: type as 'income' | 'expense',
          includeCustom: true
        })

        // Update category in same transaction
        updates.category_id = replacementCategory.id
        changedFields.push(messages.categoryChanged(currentCategory.name, replacementCategory.name))

        logger.info('Category replaced due to type mismatch', {
          transactionId,
          oldCategory: currentCategory.name,
          newCategory: replacementCategory.name,
          oldType: transaction.type,
          newType: type
        })
      }
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

    // Story 8.1: Fire analytics event for type change (AC-8.1.5)
    // Story 8.3: Include category change info in analytics (AC-8.3.1, AC-8.3.2)
    // Fire-and-forget - does NOT block response
    if (updates.type) {
      const currentCategory = (transaction as any).categories
      trackEvent(
        WhatsAppAnalyticsEvent.TRANSACTION_TYPE_CHANGED,
        session.userId,
        {
          transaction_id: transactionId,
          old_type: transaction.type,
          new_type: updates.type,
          // Include category change info if category was replaced
          ...(updates.category_id && currentCategory ? {
            old_category_id: currentCategory.id,
            new_category_id: updates.category_id
          } : {})
        }
      )
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

    // Story 3.2: Track tier action for delete_expense (AC-3.2.2)
    // Fire-and-forget - does NOT block response (AC-3.2.9)
    if (transaction.type === 'expense') {
      trackTierAction(session.userId, 'delete_expense')
    }

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

    // Look up new category (case-insensitive, only user's categories and defaults)
    const { data: categoryData } = await supabase
      .from('categories')
      .select('id, name')
      .or(`user_id.is.null,user_id.eq.${session.userId}`)
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

    // Story 3.2: Track tier action for edit_category (AC-3.2.4)
    // Fire-and-forget - does NOT block response (AC-3.2.9)
    trackTierAction(session.userId, 'edit_category')

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

