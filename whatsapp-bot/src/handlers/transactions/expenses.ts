import { getSupabaseClient } from '../../services/database/supabase-client.js'
import { getUserSession } from '../../auth/session-manager.js'
import { ParsedIntent } from '../../types.js'
import { messages, formatDate } from '../../localization/pt-br.js'
import { checkForDuplicate } from '../../services/detection/duplicate-detector.js'
import { storePendingTransaction } from './duplicate-confirmation.js'
import { logger } from '../../services/monitoring/logger.js'

export async function handleAddExpense(whatsappNumber: string, intent: ParsedIntent): Promise<string> {
  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.notAuthenticated
    }

    const { amount, category, description, date, type, paymentMethod } = intent.entities

    if (!amount) {
      return messages.invalidAmount
    }

    // Find category ID
    const supabase = getSupabaseClient()
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

    // Check for duplicate transactions
    const expenseData = {
      amount,
      category,
      description,
      date: date || new Date().toISOString().split('T')[0],
      type: type || 'expense',
      paymentMethod
    }

    const duplicateCheck = await checkForDuplicate(session.userId, expenseData)
    
    if (duplicateCheck.isDuplicate) {
      if (duplicateCheck.confidence >= 0.95) {
        // Auto-block high confidence duplicates
        return messages.duplicateBlocked(duplicateCheck.reason || 'Transação muito similar encontrada')
      } else {
        // Store pending transaction and ask for confirmation
        storePendingTransaction(whatsappNumber, session.userId, expenseData)
        return messages.duplicateWarning(
          duplicateCheck.reason || 'Transação similar encontrada',
          Math.round(duplicateCheck.confidence * 100)
        )
      }
    }

    // Create transaction
    const transactionDate = date || new Date().toISOString().split('T')[0]

    // Generate user-readable transaction ID
    const { data: idData, error: idError } = await supabase
      .rpc('generate_transaction_id')

    if (idError) {
      logger.error('Error generating transaction ID', { whatsappNumber }, idError)
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
      logger.error('Error creating transaction', { whatsappNumber, transactionId: userReadableId }, error)
      return messages.expenseError
    }

    const categoryName = data.category?.name || 'Sem categoria'
    const formattedDate = formatDate(new Date(transactionDate))
    const paymentMethodText = paymentMethod ? `\n💳 Método: ${paymentMethod}` : ''
    const transactionIdText = `\n🆔 ID: ${userReadableId}`

    let response = ''
    if (type === 'income') {
      response = messages.incomeAdded(amount, categoryName, formattedDate) + paymentMethodText + transactionIdText
    } else {
      response = messages.expenseAdded(amount, categoryName, formattedDate) + paymentMethodText + transactionIdText
    }

    // Check if this is the user's first expense and celebrate!
    if (type !== 'income') {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('first_expense_added')
        .eq('user_id', session.userId)
        .single()

      if (profile && !profile.first_expense_added) {
        // Mark first expense as added
        await supabase
          .from('user_profiles')
          .update({
            first_expense_added: true,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', session.userId)

        // Add celebration message
        response += '\n\n🎉 *Parabéns!* Primeira despesa registrada com sucesso!'
        response += '\n\n💡 *Próximos passos:*'
        response += '\n• Configure um orçamento mensal para suas categorias'
        response += '\n• Envie fotos de SMS bancários para registro automático'
        response += '\n• Digite "relatório" para ver suas finanças'
      }
    }

    return response
  } catch (error) {
    logger.error('Error in handleAddExpense', { whatsappNumber }, error as Error)
    return messages.expenseError
  }
}

export async function handleShowExpenses(whatsappNumber: string): Promise<string> {
  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.notAuthenticated
    }

    const supabase = getSupabaseClient()

    // Get this month's transactions
    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

    const { data: transactions, error } = await supabase
      .from('transactions')
      .select(`
        *,
        category:categories(name, icon)
      `)
      .eq('user_id', session.userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false })
      .limit(10)

    if (error) {
      logger.error('Error fetching transactions', { whatsappNumber, userId: session.userId }, error)
      return messages.genericError
    }

    if (!transactions || transactions.length === 0) {
      return messages.noTransactions
    }

    let response = '📋 *Últimas transações (este mês):*\n\n'

    for (const tx of transactions) {
      const icon = tx.category?.icon || (tx.type === 'income' ? '💰' : '💸')
      const sign = tx.type === 'income' ? '+' : '-'
      const categoryName = tx.category?.name || 'Sem categoria'
      const formattedDate = formatDate(new Date(tx.date))
      
      response += `${icon} ${sign}R$ ${tx.amount}\n`
      response += `   ${categoryName} - ${formattedDate}\n`
      if (tx.description) {
        response += `   "${tx.description}"\n`
      }
      if (tx.payment_method) {
        response += `   💳 ${tx.payment_method}\n`
      }
      response += '\n'
    }

    // Add totals
    const totalIncome = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0)
    
    const totalExpenses = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0)

    response += `\n💰 Receitas: R$ ${totalIncome.toFixed(2)}\n`
    response += `💸 Despesas: R$ ${totalExpenses.toFixed(2)}\n`
    response += `📊 Saldo: R$ ${(totalIncome - totalExpenses).toFixed(2)}`

    return response
  } catch (error) {
    logger.error('Error in handleShowExpenses', { whatsappNumber }, error as Error)
    return messages.genericError
  }
}

