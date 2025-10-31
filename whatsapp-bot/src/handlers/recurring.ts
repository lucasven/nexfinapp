import { getSupabaseClient } from '../services/supabase-client'
import { getUserSession } from '../auth/session-manager'
import { ParsedIntent } from '../types'
import { messages } from '../localization/pt-br'

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
      console.error('Error creating recurring transaction:', error)
      return messages.recurringError
    }

    // Generate payments for the next 3 months
    await generateRecurringPayments(session.userId, data.id, dayOfMonth)

    return messages.recurringAdded(amount, categoryName, dayOfMonth)
  } catch (error) {
    console.error('Error in handleAddRecurring:', error)
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
      console.error('Error fetching recurring transactions:', error)
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
    console.error('Error in handleShowRecurring:', error)
    return messages.genericError
  }
}

export async function handleDeleteRecurring(whatsappNumber: string): Promise<string> {
  // For simplicity, we'll return instructions to use the web app
  return '❌ Para deletar despesas recorrentes, use a aplicação web ou especifique qual deseja remover.'
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

