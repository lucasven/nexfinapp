import { getSupabaseClient } from '../services/supabase-client'
import { getUserSession } from '../auth/session-manager'
import { ParsedIntent } from '../types'
import { messages, getMonthName } from '../localization/pt-br'

export async function handleSetBudget(whatsappNumber: string, intent: ParsedIntent): Promise<string> {
  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.notAuthenticated
    }

    const { amount, category, month, year } = intent.entities

    if (!amount || !category) {
      return messages.budgetError
    }

    const supabase = getSupabaseClient()

    // Find category
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name')
      .eq('type', 'expense')
      .ilike('name', `%${category}%`)
      .limit(1)

    if (!categories || categories.length === 0) {
      return messages.missingCategory
    }

    const categoryId = categories[0].id
    const categoryName = categories[0].name

    // Use current month/year if not specified
    const now = new Date()
    const targetMonth = month || now.getMonth() + 1
    const targetYear = year || now.getFullYear()

    // Create or update budget
    const { data, error } = await supabase
      .from('budgets')
      .upsert({
        user_id: session.userId,
        category_id: categoryId,
        amount: amount,
        month: targetMonth,
        year: targetYear
      }, {
        onConflict: 'user_id,category_id,month,year'
      })
      .select()
      .single()

    if (error) {
      console.error('Error setting budget:', error)
      return messages.budgetError
    }

    const monthName = getMonthName(targetMonth)
    return messages.budgetSet(categoryName, amount, `${monthName}/${targetYear}`)
  } catch (error) {
    console.error('Error in handleSetBudget:', error)
    return messages.budgetError
  }
}

export async function handleShowBudgets(whatsappNumber: string): Promise<string> {
  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.notAuthenticated
    }

    const supabase = getSupabaseClient()
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()

    // Get budgets for current month
    const { data: budgets, error } = await supabase
      .from('budgets')
      .select(`
        *,
        category:categories(name, icon)
      `)
      .eq('user_id', session.userId)
      .eq('month', currentMonth)
      .eq('year', currentYear)

    if (error) {
      console.error('Error fetching budgets:', error)
      return messages.genericError
    }

    if (!budgets || budgets.length === 0) {
      return messages.noBudgets
    }

    // Get spending for each budget
    const startDate = new Date(currentYear, currentMonth - 1, 1).toISOString().split('T')[0]
    const endDate = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0]

    let response = `📊 *Orçamentos - ${getMonthName(currentMonth)}/${currentYear}*\n\n`

    for (const budget of budgets) {
      const { data: transactions } = await supabase
        .from('transactions')
        .select('amount')
        .eq('user_id', session.userId)
        .eq('category_id', budget.category_id)
        .eq('type', 'expense')
        .gte('date', startDate)
        .lte('date', endDate)

      const spent = transactions?.reduce((sum, t) => sum + Number(t.amount), 0) || 0
      const budgetAmount = Number(budget.amount)
      const remaining = budgetAmount - spent
      const percentage = (spent / budgetAmount) * 100

      const icon = budget.category?.icon || '📁'
      const categoryName = budget.category?.name || 'Sem categoria'

      response += `${icon} *${categoryName}*\n`
      response += `   Orçamento: R$ ${budgetAmount.toFixed(2)}\n`
      response += `   Gasto: R$ ${spent.toFixed(2)} (${percentage.toFixed(0)}%)\n`
      response += `   Restante: R$ ${remaining.toFixed(2)}\n`
      
      if (percentage >= 100) {
        response += `   ⚠️ Orçamento excedido!\n`
      } else if (percentage >= 80) {
        response += `   ⚡ Atenção: perto do limite!\n`
      } else if (percentage >= 50) {
        response += `   ✅ No caminho certo\n`
      } else {
        response += `   💪 Muito bem!\n`
      }
      
      response += '\n'
    }

    return response
  } catch (error) {
    console.error('Error in handleShowBudgets:', error)
    return messages.genericError
  }
}

