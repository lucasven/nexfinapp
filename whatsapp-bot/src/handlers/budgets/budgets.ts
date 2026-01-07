import { getSupabaseClient } from '../../services/database/supabase-client.js'
import { getUserSession } from '../../auth/session-manager.js'
import { ParsedIntent } from '../../types.js'
import { messages, getMonthName } from '../../localization/pt-br.js'
import { logger } from '../../services/monitoring/logger.js'
import { storeUndoState } from '../core/undo.js'
import { trackTierAction } from '../../services/onboarding/tier-tracker.js'

/**
 * Check if message contains keywords indicating a default/fixed budget
 * Keywords: "fixo", "sempre", "todo mês", "todos os meses", "fixed", "every month"
 */
function isDefaultBudgetIntent(originalMessage?: string, is_default?: boolean): boolean {
  if (is_default === true) return true
  if (!originalMessage) return false

  const lowerMessage = originalMessage.toLowerCase()
  const defaultKeywords = ['fixo', 'sempre', 'todo mês', 'todos os meses', 'fixed', 'every month', 'all months']
  return defaultKeywords.some(keyword => lowerMessage.includes(keyword))
}

export async function handleSetBudget(whatsappNumber: string, intent: ParsedIntent): Promise<string> {
  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.notAuthenticated
    }

    const { amount, category, month, year, is_default } = intent.entities

    if (!amount || !category) {
      return messages.budgetError
    }

    const supabase = getSupabaseClient()

    // Find category (only user's categories and defaults)
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name')
      .eq('type', 'expense')
      .or(`user_id.is.null,user_id.eq.${session.userId}`)
      .ilike('name', `%${category}%`)
      .limit(1)

    if (!categories || categories.length === 0) {
      return messages.missingCategory
    }

    const categoryId = categories[0].id
    const categoryName = categories[0].name

    // Check if user wants a default budget (via AI flag or keywords)
    const isDefaultBudget = isDefaultBudgetIntent(intent.originalMessage, is_default)

    if (isDefaultBudget) {
      // Create or update default budget
      // First try to find existing default budget for this category
      const { data: existing } = await supabase
        .from('budgets')
        .select('id')
        .eq('user_id', session.userId)
        .eq('category_id', categoryId)
        .eq('is_default', true)
        .single()

      let data, error
      if (existing) {
        // Update existing default budget
        const result = await supabase
          .from('budgets')
          .update({ amount: amount, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select()
          .single()
        data = result.data
        error = result.error
      } else {
        // Create new default budget
        const result = await supabase
          .from('budgets')
          .insert({
            user_id: session.userId,
            category_id: categoryId,
            amount: amount,
            is_default: true,
            month: null,
            year: null
          })
          .select()
          .single()
        data = result.data
        error = result.error
      }

      if (error) {
        logger.error('Error setting default budget', { whatsappNumber, userId: session.userId }, error)
        return messages.budgetError
      }

      trackTierAction(session.userId, 'set_budget')
      return messages.defaultBudgetSet(categoryName, amount)
    } else {
      // Monthly budget (existing logic)
      const now = new Date()
      const targetMonth = month || now.getMonth() + 1
      const targetYear = year || now.getFullYear()

      // First try to find existing monthly budget for this category/month/year
      const { data: existing } = await supabase
        .from('budgets')
        .select('id')
        .eq('user_id', session.userId)
        .eq('category_id', categoryId)
        .eq('month', targetMonth)
        .eq('year', targetYear)
        .eq('is_default', false)
        .single()

      let data, error
      if (existing) {
        // Update existing monthly budget
        const result = await supabase
          .from('budgets')
          .update({ amount: amount, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select()
          .single()
        data = result.data
        error = result.error
      } else {
        // Create new monthly budget
        const result = await supabase
          .from('budgets')
          .insert({
            user_id: session.userId,
            category_id: categoryId,
            amount: amount,
            month: targetMonth,
            year: targetYear,
            is_default: false
          })
          .select()
          .single()
        data = result.data
        error = result.error
      }

      if (error) {
        logger.error('Error setting budget', { whatsappNumber, userId: session.userId }, error)
        return messages.budgetError
      }

      // Story 3.2: Track tier action for set_budget (AC-3.2.5)
      // Fire-and-forget - does NOT block response (AC-3.2.9)
      trackTierAction(session.userId, 'set_budget')

      const monthName = getMonthName(targetMonth)
      return messages.budgetSet(categoryName, amount, `${monthName}/${targetYear}`)
    }
  } catch (error) {
    logger.error('Error in handleSetBudget', { whatsappNumber }, error as Error)
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

    // Get ALL budgets (both defaults and monthly)
    const { data: allBudgets, error } = await supabase
      .from('budgets')
      .select(`
        *,
        category:categories(name, icon)
      `)
      .eq('user_id', session.userId)

    if (error) {
      logger.error('Error fetching budgets', { whatsappNumber, userId: session.userId }, error)
      return messages.genericError
    }

    if (!allBudgets || allBudgets.length === 0) {
      return messages.noBudgets
    }

    // Separate defaults and resolve effective budgets
    const defaultBudgets = allBudgets.filter(b => b.is_default === true)
    const monthlyBudgets = allBudgets.filter(b =>
      b.is_default === false && b.month === currentMonth && b.year === currentYear
    )

    // Merge: monthly override takes precedence
    const effectiveBudgets = new Map<string, { budget: typeof allBudgets[0], source: 'default' | 'override' }>()
    for (const budget of defaultBudgets) {
      effectiveBudgets.set(budget.category_id, { budget, source: 'default' })
    }
    for (const budget of monthlyBudgets) {
      effectiveBudgets.set(budget.category_id, { budget, source: 'override' })
    }

    if (effectiveBudgets.size === 0) {
      return messages.noBudgets
    }

    // Get spending for each budget
    const startDate = new Date(currentYear, currentMonth - 1, 1).toISOString().split('T')[0]
    const endDate = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0]

    let response = `📊 *Orçamentos - ${getMonthName(currentMonth)}/${currentYear}*\n\n`
    let hasDefaults = false

    for (const [categoryId, { budget, source }] of effectiveBudgets) {
      const { data: transactions } = await supabase
        .from('transactions')
        .select('amount')
        .eq('user_id', session.userId)
        .eq('category_id', categoryId)
        .eq('type', 'expense')
        .gte('date', startDate)
        .lte('date', endDate)

      const spent = transactions?.reduce((sum, t) => sum + Number(t.amount), 0) || 0
      const budgetAmount = Number(budget.amount)
      const remaining = budgetAmount - spent
      const percentage = (spent / budgetAmount) * 100

      const icon = budget.category?.icon || '📁'
      const categoryName = budget.category?.name || 'Sem categoria'
      const sourceLabel = source === 'default' ? ' 🔄' : ''

      if (source === 'default') hasDefaults = true

      response += `${icon} *${categoryName}*${sourceLabel}\n`
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

    // Add legend if there are default budgets
    if (hasDefaults) {
      response += `\n🔄 _Orçamentos com 🔄 são fixos e aplicados automaticamente todo mês_`
    }

    return response
  } catch (error) {
    logger.error('Error in handleShowBudgets', { whatsappNumber }, error as Error)
    return messages.genericError
  }
}

/**
 * Delete a budget for a specific category and period
 * Supports deleting both default/fixed budgets and monthly budgets
 *
 * @param whatsappNumber - User's WhatsApp number
 * @param intent - Parsed intent with category and optional month/year
 * @returns Success message or error
 */
export async function handleDeleteBudget(
  whatsappNumber: string,
  intent: ParsedIntent
): Promise<string> {
  const { category, month, year, is_default } = intent.entities

  if (!category) {
    return '❌ Categoria não especificada.'
  }

  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.loginPrompt
    }

    const supabase = getSupabaseClient()

    // Find the category (only user's categories and defaults)
    const { data: categoryData } = await supabase
      .from('categories')
      .select('id, name')
      .eq('type', 'expense')
      .or(`user_id.is.null,user_id.eq.${session.userId}`)
      .ilike('name', `%${category}%`)
      .single()

    if (!categoryData) {
      return messages.categoryNotFound(category)
    }

    // Check if user wants to delete a default budget
    const isDefaultBudget = isDefaultBudgetIntent(intent.originalMessage, is_default)

    let budget
    if (isDefaultBudget) {
      // Find the default budget for this category
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', session.userId)
        .eq('category_id', categoryData.id)
        .eq('is_default', true)
        .single()

      if (error || !data) {
        logger.error('Default budget not found', { category })
        return messages.defaultBudgetNotFound(categoryData.name)
      }
      budget = data
    } else {
      // Find the monthly budget
      const now = new Date()
      const targetMonth = month || now.getMonth() + 1
      const targetYear = year || now.getFullYear()

      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', session.userId)
        .eq('category_id', categoryData.id)
        .eq('month', targetMonth)
        .eq('year', targetYear)
        .eq('is_default', false)
        .single()

      if (error || !data) {
        logger.error('Budget not found', { category, month: targetMonth, year: targetYear })
        return messages.budgetNotFound(categoryData.name)
      }
      budget = data
    }

    // Store undo state before deleting
    storeUndoState(whatsappNumber, 'delete_budget', budget)

    // Delete the budget
    const { error: deleteError } = await supabase
      .from('budgets')
      .delete()
      .eq('id', budget.id)

    if (deleteError) {
      logger.error('Failed to delete budget', { category, error: deleteError })
      return messages.genericError
    }

    logger.info('Budget deleted', {
      whatsappNumber,
      userId: session.userId,
      category: categoryData.name,
      is_default: isDefaultBudget
    })

    return isDefaultBudget
      ? messages.defaultBudgetDeleted(categoryData.name)
      : messages.budgetDeleted(categoryData.name)
  } catch (error) {
    logger.error('Error in handleDeleteBudget', { whatsappNumber, category }, error as Error)
    return messages.genericError
  }
}

