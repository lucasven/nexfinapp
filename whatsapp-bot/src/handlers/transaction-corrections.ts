import { getSupabaseClient } from '../services/supabase-client'
import { getUserSession } from '../auth/session-manager'
import { CorrectionIntent } from '../services/correction-detector'
import { messages, formatDate } from '../localization/pt-br'

/**
 * Handle transaction correction requests
 */
export async function handleTransactionCorrection(
  whatsappNumber: string,
  correctionIntent: CorrectionIntent
): Promise<string> {
  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.notAuthenticated
    }

    if (!correctionIntent.transactionId) {
      return '❌ ID da transação não encontrado. Use o ID de 6 caracteres que aparece quando você adiciona uma transação.'
    }

    const supabase = getSupabaseClient()

    // Get the transaction
    const { data: transaction, error: fetchError } = await supabase
      .from('transactions')
      .select(`
        *,
        category:categories(name)
      `)
      .eq('user_id', session.userId)
      .eq('user_readable_id', correctionIntent.transactionId)
      .single()

    if (fetchError || !transaction) {
      return `❌ Transação ${correctionIntent.transactionId} não encontrada. Verifique o ID e tente novamente.`
    }

    // Handle different correction actions
    switch (correctionIntent.action) {
      case 'delete':
        return await deleteTransaction(transaction, supabase)
      
      case 'update':
        if (!correctionIntent.updates) {
          return '❌ Nenhuma alteração especificada. Use "era R$ X" ou "era categoria Y" para especificar as mudanças.'
        }
        return await updateTransaction(transaction, correctionIntent.updates, supabase)
      
      default:
        return '❌ Tipo de correção não reconhecido. Use "remover", "arrumar" ou "corrigir" seguido do ID da transação.'
    }
  } catch (error) {
    console.error('Error in handleTransactionCorrection:', error)
    return messages.genericError
  }
}

/**
 * Delete a transaction
 */
async function deleteTransaction(transaction: any, supabase: any): Promise<string> {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', transaction.id)

  if (error) {
    console.error('Error deleting transaction:', error)
    return '❌ Erro ao remover a transação. Tente novamente.'
  }

  const amount = `R$ ${transaction.amount.toFixed(2)}`
  const description = transaction.description || 'Sem descrição'
  const category = transaction.category?.name || 'Sem categoria'
  const date = formatDate(new Date(transaction.date))

  return `✅ Transação removida com sucesso!\n\n` +
         `🗑️ ${amount} - ${description}\n` +
         `📁 ${category}\n` +
         `📅 ${date}\n` +
         `🆔 ${transaction.user_readable_id}`
}

/**
 * Update a transaction
 */
async function updateTransaction(
  transaction: any,
  updates: NonNullable<CorrectionIntent['updates']>,
  supabase: any
): Promise<string> {
  const updateData: any = {}

  // Update amount
  if (updates.amount !== undefined) {
    updateData.amount = updates.amount
  }

  // Update category
  if (updates.category) {
    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', transaction.user_id)
      .ilike('name', `%${updates.category}%`)
      .limit(1)

    if (category && category.length > 0) {
      updateData.category_id = category[0].id
    } else {
      // Use default category if not found
      const { data: defaultCat } = await supabase
        .from('categories')
        .select('id')
        .eq('name', 'Other Expense')
        .single()

      if (defaultCat) {
        updateData.category_id = defaultCat.id
      }
    }
  }

  // Update description
  if (updates.description) {
    updateData.description = updates.description
  }

  // Update date
  if (updates.date) {
    updateData.date = updates.date
  }

  // Update payment method
  if (updates.paymentMethod) {
    updateData.payment_method = updates.paymentMethod
  }

  // If no updates to make
  if (Object.keys(updateData).length === 0) {
    return '❌ Nenhuma alteração especificada. Use "era R$ X" ou "era categoria Y" para especificar as mudanças.'
  }

  // Perform the update
  const { data: updatedTransaction, error } = await supabase
    .from('transactions')
    .update(updateData)
    .eq('id', transaction.id)
    .select(`
      *,
      category:categories(name)
    `)
    .single()

  if (error) {
    console.error('Error updating transaction:', error)
    return '❌ Erro ao atualizar a transação. Tente novamente.'
  }

  // Format response
  const amount = `R$ ${updatedTransaction.amount.toFixed(2)}`
  const description = updatedTransaction.description || 'Sem descrição'
  const category = updatedTransaction.category?.name || 'Sem categoria'
  const date = formatDate(new Date(updatedTransaction.date))
  const paymentMethod = updatedTransaction.payment_method ? 
    `\n💳 ${updatedTransaction.payment_method}` : ''

  const changes = []
  if (updates.amount !== undefined) changes.push('valor')
  if (updates.category) changes.push('categoria')
  if (updates.description) changes.push('descrição')
  if (updates.date) changes.push('data')
  if (updates.paymentMethod) changes.push('método de pagamento')

  return `✅ Transação atualizada com sucesso!\n\n` +
         `📝 Alterado: ${changes.join(', ')}\n\n` +
         `💵 ${amount} - ${description}\n` +
         `📁 ${category}\n` +
         `📅 ${date}${paymentMethod}\n` +
         `🆔 ${updatedTransaction.user_readable_id}`
}

/**
 * Get transaction details for display
 */
export async function getTransactionDetails(
  whatsappNumber: string,
  transactionId: string
): Promise<string> {
  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.notAuthenticated
    }

    const supabase = getSupabaseClient()

    const { data: transaction, error } = await supabase
      .from('transactions')
      .select(`
        *,
        category:categories(name)
      `)
      .eq('user_id', session.userId)
      .eq('user_readable_id', transactionId)
      .single()

    if (error || !transaction) {
      return `❌ Transação ${transactionId} não encontrada.`
    }

    const amount = `R$ ${transaction.amount.toFixed(2)}`
    const description = transaction.description || 'Sem descrição'
    const category = transaction.category?.name || 'Sem categoria'
    const date = formatDate(new Date(transaction.date))
    const paymentMethod = transaction.payment_method ? 
      `\n💳 ${transaction.payment_method}` : ''

    return `📋 Detalhes da transação ${transactionId}:\n\n` +
           `💵 ${amount} - ${description}\n` +
           `📁 ${category}\n` +
           `📅 ${date}${paymentMethod}\n\n` +
           `💡 Para corrigir, use:\n` +
           `• "remover ${transactionId}" - para deletar\n` +
           `• "${transactionId} era R$ X" - para alterar valor\n` +
           `• "${transactionId} era categoria Y" - para alterar categoria`
  } catch (error) {
    console.error('Error getting transaction details:', error)
    return messages.genericError
  }
}
