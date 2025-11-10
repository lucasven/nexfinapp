import { getSupabaseClient } from '../../services/database/supabase-client.js'
import { getUserSession } from '../../auth/session-manager.js'
import { ParsedIntent } from '../../types.js'
import { messages, getMonthName } from '../../localization/pt-br.js'
import { logger } from '../../services/monitoring/logger.js'

export async function handleShowReport(whatsappNumber: string, intent: ParsedIntent): Promise<string> {
  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.notAuthenticated
    }

    const supabase = getSupabaseClient()

    // Get month and year from intent or use current
    const now = new Date()
    const month = intent.entities.month || now.getMonth() + 1
    const year = intent.entities.year || now.getFullYear()

    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0]
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    // Get all transactions for the period
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select(`
        *,
        category:categories(name, icon)
      `)
      .eq('user_id', session.userId)
      .gte('date', startDate)
      .lte('date', endDate)

    if (error) {
      logger.error('Error fetching transactions for report:', error)
      return messages.genericError
    }

    if (!transactions || transactions.length === 0) {
      return messages.noTransactions
    }

    // Calculate totals
    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0)

    const expenses = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0)

    const balance = income - expenses

    // Group by category
    const categoryBreakdown: { [key: string]: { total: number; count: number; icon: string } } = {}

    for (const tx of transactions) {
      if (tx.type === 'expense') {
        const categoryName = tx.category?.name || 'Sem categoria'
        const icon = tx.category?.icon || '💸'

        if (!categoryBreakdown[categoryName]) {
          categoryBreakdown[categoryName] = { total: 0, count: 0, icon }
        }

        categoryBreakdown[categoryName].total += Number(tx.amount)
        categoryBreakdown[categoryName].count += 1
      }
    }

    // Sort categories by total
    const sortedCategories = Object.entries(categoryBreakdown)
      .sort(([, a], [, b]) => b.total - a.total)

    // Build response
    let response = messages.reportHeader(getMonthName(month), year)
    response += '\n\n'
    response += messages.reportSummary(income, expenses, balance)
    response += '\n\n'

    if (sortedCategories.length > 0) {
      response += '📊 *Despesas por Categoria*\n\n'

      for (const [categoryName, data] of sortedCategories) {
        const percentage = (data.total / expenses) * 100
        response += `${data.icon} ${categoryName}\n`
        response += `   R$ ${data.total.toFixed(2)} (${percentage.toFixed(0)}%)\n`
        response += `   ${data.count} transação${data.count > 1 ? 'ões' : ''}\n\n`
      }
    }

    // Add top spending day
    const dailyTotals: { [key: string]: number } = {}
    for (const tx of transactions.filter(t => t.type === 'expense')) {
      const date = tx.date
      dailyTotals[date] = (dailyTotals[date] || 0) + Number(tx.amount)
    }

    const topDay = Object.entries(dailyTotals)
      .sort(([, a], [, b]) => b - a)[0]

    if (topDay) {
      const [date, total] = topDay
      const formattedDate = new Date(date).toLocaleDateString('pt-BR')
      response += `\n📅 Dia com mais gastos: ${formattedDate} (R$ ${total.toFixed(2)})`
    }

    return response
  } catch (error) {
    logger.error('Error in handleShowReport:', error as Error)
    return messages.genericError
  }
}

