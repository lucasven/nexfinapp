import { getSupabaseClient } from '../services/supabase-client.js'
import { getUserSession } from '../auth/session-manager.js'
import { ParsedIntent } from '../types.js'
import { messages } from '../localization/pt-br.js'
import { logger } from '../services/logger.js'
import { storeUndoState } from './undo.js'

export async function handleAddRecurring(whatsappNumber: string, intent: ParsedIntent): Promise<string> {
  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.notAuthenticated
    }

    const { amount, category, dayOfMonth, type, description } = intent.entities

    if (!amount || !dayOfMonth) {
      return messages.recurringError
    }

    const supabase = getSupabaseClient()

    // Find category if specified
    let categoryId = null
    let categoryName = 'Sem categoria'

    if (category) {
      const { data: categories } = await supabase
        .from('categories')
        .select('id, name')
        .eq('type', type || 'expense')
        .ilike('name', `%${category}%`)
        .limit(1)

      if (categories && categories.length > 0) {
        categoryId = categories[0].id
        categoryName = categories[0].name
      }
    }

    // Create recurring transaction
    const { data, error } = await supabase
      .from('recurring_transactions')
      .insert({
        user_id: session.userId,
        amount: amount,
        type: type || 'expense',
        category_id: categoryId,
        description: description || null,
        day_of_month: dayOfMonth,
        is_active: true
      })
      .select()
      .single()

    if (error) {
      logger.error('Error creating recurring transaction', { whatsappNumber, userId: session.userId }, error)
      return messages.recurringError
    }

    // Generate payments for the next 3 months
    await generateRecurringPayments(session.userId, data.id, dayOfMonth)

    return messages.recurringAdded(amount, categoryName, dayOfMonth)
  } catch (error) {
    logger.error('Error in handleAddRecurring', { whatsappNumber }, error as Error)
    return messages.recurringError
  }
}

export async function handleShowRecurring(whatsappNumber: string): Promise<string> {
  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.notAuthenticated
    }

    const supabase = getSupabaseClient()

    const { data: recurring, error } = await supabase
      .from('recurring_transactions')
      .select(`
        *,
        category:categories(name, icon)
      `)
      .eq('user_id', session.userId)
      .eq('is_active', true)
      .order('day_of_month', { ascending: true })

    if (error) {
      logger.error('Error fetching recurring transactions', { whatsappNumber, userId: session.userId }, error)
      return messages.genericError
    }

    if (!recurring || recurring.length === 0) {
      return messages.noRecurring
    }

    let response = '🔄 *Despesas Recorrentes*\n\n'

    for (const rec of recurring) {
      const icon = rec.category?.icon || (rec.type === 'income' ? '💰' : '💸')
      const categoryName = rec.category?.name || 'Sem categoria'
      const sign = rec.type === 'income' ? '+' : '-'

      response += `${icon} *${categoryName}*\n`
      response += `   ${sign}R$ ${Number(rec.amount).toFixed(2)}\n`
      response += `   Todo dia ${rec.day_of_month}\n`
      if (rec.description) {
        response += `   "${rec.description}"\n`
      }
      response += '\n'
    }

    // Calculate monthly total
    const monthlyTotal = recurring
      .filter(r => r.type === 'expense')
      .reduce((sum, r) => sum + Number(r.amount), 0)

    response += `\n💸 Total mensal: R$ ${monthlyTotal.toFixed(2)}`

    return response
  } catch (error) {
    logger.error('Error in handleShowRecurring', { whatsappNumber }, error as Error)
    return messages.genericError
  }
}

export async function handleDeleteRecurring(whatsappNumber: string): Promise<string> {
  // For simplicity, we'll return instructions to use the web app
  return '❌ Para deletar despesas recorrentes, use a aplicação web ou especifique qual deseja remover.'
}

/**
 * Edit an existing recurring payment
 * 
 * @param whatsappNumber - User's WhatsApp number
 * @param intent - Parsed intent with recurring name/description and fields to update
 * @returns Success message or error
 */
export async function handleEditRecurring(
  whatsappNumber: string, 
  intent: ParsedIntent
): Promise<string> {
  const { description, amount, dayOfMonth } = intent.entities

  if (!description) {
    return '❌ Nome ou descrição do pagamento recorrente não fornecido.'
  }

  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.loginPrompt
    }

    const supabase = getSupabaseClient()

    // Find the recurring transaction by description (partial match)
    const { data: recurring, error: fetchError } = await supabase
      .from('recurring_transactions')
      .select('*')
      .eq('user_id', session.userId)
      .eq('is_active', true)
      .ilike('description', `%${description}%`)
      .single()

    if (fetchError || !recurring) {
      logger.error('Recurring transaction not found', { description, userId: session.userId })
      return messages.recurringNotFound(description)
    }

    // Store undo state before making changes
    storeUndoState(whatsappNumber, 'edit_recurring', recurring)

    // Build update object with only provided fields
    const updates: any = {}
    const changedFields: string[] = []

    if (amount !== undefined && amount !== recurring.amount) {
      updates.amount = amount
      changedFields.push(`valor (R$ ${amount.toFixed(2)})`)
    }

    if (dayOfMonth !== undefined && dayOfMonth !== recurring.day_of_month) {
      updates.day_of_month = dayOfMonth
      changedFields.push(`dia (${dayOfMonth})`)
    }

    // If no changes, return early
    if (Object.keys(updates).length === 0) {
      return messages.correctionNoChanges
    }

    // Update the recurring transaction
    const { error: updateError } = await supabase
      .from('recurring_transactions')
      .update(updates)
      .eq('id', recurring.id)

    if (updateError) {
      logger.error('Failed to update recurring transaction', { description, error: updateError })
      return messages.genericError
    }

    logger.info('Recurring transaction edited', {
      whatsappNumber,
      userId: session.userId,
      description,
      changedFields
    })

    return messages.recurringEdited(recurring.description || description)
  } catch (error) {
    logger.error('Error in handleEditRecurring', { whatsappNumber, description }, error as Error)
    return messages.genericError
  }
}

/**
 * Convert an existing expense transaction into a recurring payment
 * 
 * @param whatsappNumber - User's WhatsApp number
 * @param transactionId - Transaction ID to convert
 * @param dayOfMonth - Day of month for recurring payment
 * @returns Success message or error
 */
export async function handleMakeExpenseRecurring(
  whatsappNumber: string,
  transactionId: string,
  dayOfMonth: number
): Promise<string> {
  if (!transactionId) {
    return '❌ ID da transação não fornecido.'
  }

  if (!dayOfMonth || dayOfMonth < 1 || dayOfMonth > 31) {
    return '❌ Dia do mês inválido (deve ser entre 1 e 31).'
  }

  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.loginPrompt
    }

    const supabase = getSupabaseClient()

    // Fetch the transaction
    const { data: transaction, error: fetchError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_readable_id', transactionId)
      .eq('user_id', session.userId)
      .single()

    if (fetchError || !transaction) {
      logger.error('Transaction not found for conversion', { transactionId, userId: session.userId })
      return messages.correctionTransactionNotFound(transactionId)
    }

    // Create recurring transaction from the expense
    const { data: recurring, error: createError } = await supabase
      .from('recurring_transactions')
      .insert({
        user_id: session.userId,
        amount: transaction.amount,
        type: transaction.type || 'expense',
        category_id: transaction.category_id,
        description: transaction.description || `Recorrente - ${transactionId}`,
        day_of_month: dayOfMonth,
        is_active: true
      })
      .select()
      .single()

    if (createError) {
      logger.error('Failed to create recurring transaction', { transactionId, error: createError })
      return messages.genericError
    }

    // Store undo state (store the created recurring for deletion on undo)
    storeUndoState(whatsappNumber, 'add_recurring', recurring)

    // Generate recurring payments for next 3 months
    await generateRecurringPayments(session.userId, recurring.id, dayOfMonth)

    logger.info('Expense converted to recurring', {
      whatsappNumber,
      userId: session.userId,
      transactionId,
      recurringId: recurring.id,
      dayOfMonth
    })

    return messages.expenseConvertedToRecurring(transactionId, dayOfMonth)
  } catch (error) {
    logger.error('Error in handleMakeExpenseRecurring', { whatsappNumber, transactionId, dayOfMonth }, error as Error)
    return messages.genericError
  }
}

async function generateRecurringPayments(userId: string, recurringId: string, dayOfMonth: number): Promise<void> {
  const supabase = getSupabaseClient()
  const now = new Date()

  // Generate for current and next 2 months
  for (let i = 0; i < 3; i++) {
    const targetDate = new Date(now.getFullYear(), now.getMonth() + i, dayOfMonth)
    const dueDate = targetDate.toISOString().split('T')[0]

    // Check if payment already exists
    const { data: existing } = await supabase
      .from('recurring_payments')
      .select('id')
      .eq('recurring_transaction_id', recurringId)
      .eq('due_date', dueDate)
      .single()

    if (!existing) {
      await supabase.from('recurring_payments').insert({
        recurring_transaction_id: recurringId,
        due_date: dueDate,
        is_paid: false
      })
    }
  }
}

