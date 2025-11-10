/**
 * Search and Quick Stats Handler
 * 
 * Provides search functionality and quick financial statistics
 */

import { ParsedIntent } from '../../types.js'
import { getSupabaseClient } from '../../services/database/supabase-client.js'
import { getUserSession } from '../../auth/session-manager.js'
import { messages } from '../../localization/pt-br.js'
import { logger } from '../../services/monitoring/logger.js'

/**
 * Search for transactions based on criteria
 * 
 * @param whatsappNumber - User's WhatsApp number
 * @param criteria - Search criteria from parsed intent
 * @returns Formatted search results or error
 */
export async function handleSearchTransactions(
  whatsappNumber: string,
  criteria: NonNullable<ParsedIntent['entities']['searchCriteria']>
): Promise<string> {
  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.loginPrompt
    }

    const supabase = getSupabaseClient()

    // Build query
    let query = supabase
      .from('transactions')
      .select('*, categories(name, icon)')
      .eq('user_id', session.userId)

    // Apply filters
    if (criteria.dateFrom) {
      query = query.gte('date', criteria.dateFrom)
    }

    if (criteria.dateTo) {
      query = query.lte('date', criteria.dateTo)
    }

    if (criteria.minAmount !== undefined) {
      query = query.gte('amount', criteria.minAmount)
    }

    if (criteria.maxAmount !== undefined) {
      query = query.lte('amount', criteria.maxAmount)
    }

    // Execute query
    const { data: transactions, error } = await query
      .order('date', { ascending: false })
      .limit(20)

    if (error) {
      logger.error('Error searching transactions', { whatsappNumber, criteria }, error)
      return messages.genericError
    }

    if (!transactions || transactions.length === 0) {
      return messages.searchNoResults
    }

    // Format results
    let response = `🔍 *Resultados da Busca* (${transactions.length})\n\n`

    for (const transaction of transactions) {
      const icon = (transaction as any).categories?.icon || '📁'
      const categoryName = (transaction as any).categories?.name || 'Sem categoria'
      const date = new Date(transaction.date).toLocaleDateString('pt-BR')
      const sign = transaction.type === 'income' ? '+' : '-'

      response += `${icon} ${sign}R$ ${Number(transaction.amount).toFixed(2)} - ${categoryName}\n`
      response += `   📅 ${date}`
      
      if (transaction.description) {
        response += ` • ${transaction.description}`
      }
      
      if (transaction.user_readable_id) {
        response += ` • 🆔 ID: ${transaction.user_readable_id}`
      }
      
      response += '\n\n'
    }

    return response
  } catch (error) {
    logger.error('Error in handleSearchTransactions', { whatsappNumber }, error as Error)
    return messages.genericError
  }
}

/**
 * Get quick statistics for a time period
 * 
 * @param whatsappNumber - User's WhatsApp number
 * @param period - Time period ('today', 'week', 'month')
 * @returns Formatted statistics or error
 */
export async function handleQuickStats(
  whatsappNumber: string,
  period: 'today' | 'week' | 'month'
): Promise<string> {
  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.loginPrompt
    }

    const supabase = getSupabaseClient()
    const now = new Date()

    // Calculate date range based on period
    let startDate: string
    let periodLabel: string

    switch (period) {
      case 'today':
        startDate = now.toISOString().split('T')[0]
        periodLabel = 'Hoje'
        break
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        startDate = weekAgo.toISOString().split('T')[0]
        periodLabel = 'Últimos 7 dias'
        break
      case 'month':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        startDate = monthStart.toISOString().split('T')[0]
        periodLabel = 'Este mês'
        break
      default:
        return '❌ Período inválido.'
    }

    // Fetch transactions for the period
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*, categories(name, icon)')
      .eq('user_id', session.userId)
      .gte('date', startDate)
      .order('date', { ascending: false })

    if (error) {
      logger.error('Error fetching quick stats', { whatsappNumber, period }, error)
      return messages.genericError
    }

    if (!transactions || transactions.length === 0) {
      return messages.quickStatsHeader(periodLabel) + 'Nenhuma transação encontrada.'
    }

    // Calculate statistics
    const expenses = transactions.filter(t => t.type === 'expense')
    const income = transactions.filter(t => t.type === 'income')

    const totalExpenses = expenses.reduce((sum, t) => sum + Number(t.amount), 0)
    const totalIncome = income.reduce((sum, t) => sum + Number(t.amount), 0)
    const balance = totalIncome - totalExpenses

    // Group by category (top 5)
    const categoryTotals = new Map<string, { name: string; icon: string; amount: number }>()

    for (const transaction of expenses) {
      const categoryName = (transaction as any).categories?.name || 'Sem categoria'
      const categoryIcon = (transaction as any).categories?.icon || '📁'
      const amount = Number(transaction.amount)

      if (categoryTotals.has(categoryName)) {
        categoryTotals.get(categoryName)!.amount += amount
      } else {
        categoryTotals.set(categoryName, { name: categoryName, icon: categoryIcon, amount })
      }
    }

    const topCategories = Array.from(categoryTotals.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)

    // Format response
    let response = messages.quickStatsHeader(periodLabel)
    response += `💸 *Despesas:* R$ ${totalExpenses.toFixed(2)}\n`
    response += `💰 *Receitas:* R$ ${totalIncome.toFixed(2)}\n`
    response += `📊 *Saldo:* R$ ${balance.toFixed(2)}\n\n`

    if (topCategories.length > 0) {
      response += `🏆 *Top Categorias:*\n`
      for (const category of topCategories) {
        const percentage = (category.amount / totalExpenses) * 100
        response += `${category.icon} ${category.name}: R$ ${category.amount.toFixed(2)} (${percentage.toFixed(0)}%)\n`
      }
      response += '\n'
    }

    response += `📈 *Total de transações:* ${transactions.length}`

    logger.info('Quick stats generated', {
      whatsappNumber,
      userId: session.userId,
      period,
      transactionCount: transactions.length
    })

    return response
  } catch (error) {
    logger.error('Error in handleQuickStats', { whatsappNumber, period }, error as Error)
    return messages.genericError
  }
}


