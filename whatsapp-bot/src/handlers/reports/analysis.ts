/**
 * AI Spending Analysis Handler
 * 
 * Uses LLM to provide natural language insights and recommendations
 * based on user's financial data
 */

import OpenAI from 'openai'
import { getSupabaseClient } from '../../services/database/supabase-client.js'
import { getUserSession } from '../../auth/session-manager.js'
import { messages } from '../../localization/pt-br.js'
import { logger } from '../../services/monitoring/logger.js'
import { recordLLMUsage } from '../../services/ai/ai-usage-tracker.js'
import { calculateLLMCost } from '../../services/ai/ai-cost-calculator.js'

// Lazy-load OpenAI client to avoid crashing on startup if API key is missing
let openai: OpenAI | null = null
function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  }
  return openai
}

interface FinancialStats {
  totalSpent: number
  totalIncome: number
  balance: number
  topCategories: Array<{ name: string; amount: number; percentage: number }>
  budgetUsage: Array<{ category: string; budget: number; spent: number; percentage: number }>
  trends: {
    averageDailySpending: number
    highestSpendingDay: string
    transactionCount: number
  }
  recurringCost: number
}

/**
 * Analyze user's spending patterns with AI-powered insights
 * 
 * @param whatsappNumber - User's WhatsApp number
 * @param analysisType - Type of analysis to perform
 * @returns AI-generated insights or error
 */
export async function handleAnalyzeSpending(
  whatsappNumber: string,
  analysisType: string
): Promise<string> {
  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.loginPrompt
    }

    logger.info('Starting AI spending analysis', {
      whatsappNumber,
      userId: session.userId,
      analysisType
    })

    // Fetch financial data (last 30 days)
    const stats = await gatherFinancialData(session.userId)

    if (!stats) {
      return '❌ Não foi possível coletar dados financeiros. Adicione algumas transações primeiro.'
    }

    // Call LLM for analysis
    const analysis = await analyzeWithAI(stats, analysisType, session.userId)

    logger.info('AI analysis completed', {
      whatsappNumber,
      userId: session.userId,
      analysisType
    })

    return messages.analysisResult + analysis
  } catch (error) {
    logger.error('Error in handleAnalyzeSpending', { whatsappNumber, analysisType }, error as Error)
    return messages.genericError
  }
}

/**
 * Gather financial data for analysis
 * 
 * @param userId - User ID
 * @returns Financial statistics or null if no data
 */
async function gatherFinancialData(userId: string): Promise<FinancialStats | null> {
  const supabase = getSupabaseClient()
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const startDate = thirtyDaysAgo.toISOString().split('T')[0]

  // Fetch transactions
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*, categories(name)')
    .eq('user_id', userId)
    .gte('date', startDate)
    .order('date', { ascending: true })

  if (!transactions || transactions.length === 0) {
    return null
  }

  // Calculate totals
  const expenses = transactions.filter(t => t.type === 'expense')
  const income = transactions.filter(t => t.type === 'income')

  const totalSpent = expenses.reduce((sum, t) => sum + Number(t.amount), 0)
  const totalIncome = income.reduce((sum, t) => sum + Number(t.amount), 0)
  const balance = totalIncome - totalSpent

  // Top categories
  const categoryTotals = new Map<string, number>()
  for (const transaction of expenses) {
    const categoryName = (transaction as any).categories?.name || 'Sem categoria'
    const amount = Number(transaction.amount)
    categoryTotals.set(categoryName, (categoryTotals.get(categoryName) || 0) + amount)
  }

  const topCategories = Array.from(categoryTotals.entries())
    .map(([name, amount]) => ({
      name,
      amount,
      percentage: (amount / totalSpent) * 100
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)

  // Fetch budgets
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()

  const { data: budgets } = await supabase
    .from('budgets')
    .select('*, categories(name)')
    .eq('user_id', userId)
    .eq('month', currentMonth)
    .eq('year', currentYear)

  const budgetUsage: FinancialStats['budgetUsage'] = []

  if (budgets) {
    for (const budget of budgets) {
      const categoryName = (budget as any).categories?.name || 'Sem categoria'
      const spent = categoryTotals.get(categoryName) || 0
      const budgetAmount = Number(budget.amount)
      const percentage = (spent / budgetAmount) * 100

      budgetUsage.push({
        category: categoryName,
        budget: budgetAmount,
        spent,
        percentage
      })
    }
  }

  // Calculate trends
  const dayTotals = new Map<string, number>()
  for (const transaction of expenses) {
    const day = transaction.date
    dayTotals.set(day, (dayTotals.get(day) || 0) + Number(transaction.amount))
  }

  const averageDailySpending = totalSpent / 30
  const highestSpendingEntry = Array.from(dayTotals.entries())
    .sort((a, b) => b[1] - a[1])[0]
  const highestSpendingDay = highestSpendingEntry 
    ? new Date(highestSpendingEntry[0]).toLocaleDateString('pt-BR')
    : 'N/A'

  // Fetch recurring transactions
  const { data: recurring } = await supabase
    .from('recurring_transactions')
    .select('amount, type')
    .eq('user_id', userId)
    .eq('is_active', true)

  const recurringCost = recurring
    ? recurring.filter(r => r.type === 'expense').reduce((sum, r) => sum + Number(r.amount), 0)
    : 0

  return {
    totalSpent,
    totalIncome,
    balance,
    topCategories,
    budgetUsage,
    trends: {
      averageDailySpending,
      highestSpendingDay,
      transactionCount: transactions.length
    },
    recurringCost
  }
}

/**
 * Use AI to generate natural language analysis
 * 
 * @param stats - Financial statistics
 * @param analysisType - Type of analysis requested
 * @param userId - User ID for tracking
 * @returns AI-generated analysis text
 */
async function analyzeWithAI(
  stats: FinancialStats,
  analysisType: string,
  userId: string
): Promise<string> {
  const prompt = createAnalysisPrompt(stats, analysisType)

  const startTime = Date.now()
  const client = getOpenAIClient()

  const completion = await client.chat.completions.create({
    model: 'gpt-5',
    messages: [
      {
        role: 'system',
        content: 'Você é um assistente financeiro experiente. Forneça análises claras, práticas e em português brasileiro. Seja conciso (máximo 5 parágrafos) e use emojis quando apropriado.'
      },
      { role: 'user', content: prompt }
    ],
    max_completion_tokens: 500
  })

  const duration = Date.now() - startTime

  // Track usage
  const inputTokens = completion.usage?.prompt_tokens || 0
  const outputTokens = completion.usage?.completion_tokens || 0

  await recordLLMUsage(userId, { inputTokens, outputTokens })

  logger.info('AI analysis LLM call completed', {
    userId,
    analysisType,
    model: 'gpt-5',
    inputTokens,
    outputTokens,
    durationMs: duration
  })

  return completion.choices[0].message.content || 'Não consegui analisar seus gastos.'
}

/**
 * Create analysis prompt based on type
 * 
 * @param stats - Financial statistics
 * @param type - Analysis type
 * @returns Formatted prompt for LLM
 */
function createAnalysisPrompt(stats: FinancialStats, type: string): string {
  const baseContext = `
Dados financeiros dos últimos 30 dias:
- Total gasto: R$ ${stats.totalSpent.toFixed(2)}
- Total receitas: R$ ${stats.totalIncome.toFixed(2)}
- Saldo: R$ ${stats.balance.toFixed(2)}
- Gasto médio diário: R$ ${stats.trends.averageDailySpending.toFixed(2)}
- Total de transações: ${stats.trends.transactionCount}
- Gastos recorrentes mensais: R$ ${stats.recurringCost.toFixed(2)}
`

  const topCategoriesText = stats.topCategories
    .map(c => `  • ${c.name}: R$ ${c.amount.toFixed(2)} (${c.percentage.toFixed(1)}%)`)
    .join('\n')

  const budgetText = stats.budgetUsage.length > 0
    ? stats.budgetUsage
        .map(b => `  • ${b.category}: R$ ${b.spent.toFixed(2)} de R$ ${b.budget.toFixed(2)} (${b.percentage.toFixed(0)}%)`)
        .join('\n')
    : '  Nenhum orçamento definido'

  switch (type) {
    case 'top_categories':
      return `${baseContext}

Top 5 categorias de gastos:
${topCategoriesText}

Analise onde o usuário está gastando mais e comente sobre o equilíbrio dessas despesas.`

    case 'recommendations':
      return `${baseContext}

Top categorias:
${topCategoriesText}

Orçamentos:
${budgetText}

Baseado nestes dados, dê 3 recomendações práticas e específicas para melhorar a saúde financeira.`

    case 'budget_health':
      return `${baseContext}

Orçamentos definidos:
${budgetText}

Top categorias:
${topCategoriesText}

Avalie a saúde financeira do usuário, especialmente em relação aos orçamentos. Identifique pontos positivos e áreas de atenção.`

    case 'trends':
      return `${baseContext}

Top categorias:
${topCategoriesText}

Dia de maior gasto: ${stats.trends.highestSpendingDay}

Identifique padrões e tendências nos gastos. Comente sobre consistência e previsibilidade.`

    default: // 'general'
      return `${baseContext}

Top categorias:
${topCategoriesText}

Orçamentos:
${budgetText}

Faça uma análise geral dos gastos, destacando pontos importantes e dando insights valiosos.`
  }
}

