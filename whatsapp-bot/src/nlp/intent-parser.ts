import nlp from 'compromise'
import numbers from 'compromise-numbers'
import { ParsedIntent } from '../types'

nlp.extend(numbers)

export function parseIntent(message: string, customDate?: Date): ParsedIntent {
  const doc = nlp(message.toLowerCase())
  
  // Default response
  let intent: ParsedIntent = {
    action: 'unknown',
    confidence: 0,
    entities: {}
  }

  // Check for login
  if (isLoginIntent(message)) {
    return parseLogin(message)
  }

  // Check for logout
  if (isLogoutIntent(doc)) {
    return { action: 'logout', confidence: 0.9, entities: {} }
  }

  // Check for help
  if (isHelpIntent(doc)) {
    return { action: 'help', confidence: 1, entities: {} }
  }

  // Check for recurring
  if (isRecurringIntent(doc, message)) {
    return parseRecurring(doc, message)
  }

  // Check for expense/income
  if (isExpenseIntent(doc, message)) {
    return parseExpense(doc, message, customDate)
  }

  // Check for budget
  if (isBudgetIntent(doc, message)) {
    return parseBudget(doc, message)
  }

  // Check for report
  if (isReportIntent(doc, message)) {
    return parseReport(doc, message, customDate)
  }

  // Check for categories
  if (isCategoryIntent(doc, message)) {
    return parseCategory(doc, message)
  }

  return intent
}

function isLoginIntent(message: string): boolean {
  return message.toLowerCase().includes('login:') || 
         message.toLowerCase().includes('entrar:') ||
         message.toLowerCase().includes('login') ||
         message.toLowerCase().includes('fazer login')
}

function parseLogin(message: string): ParsedIntent {
  // Format: "login: email@example.com senha123" or "login email@example.com senha123" or "entrar: email@example.com senha123"
  const match = message.match(/(?:login|entrar):?\s+(\S+@\S+)\s+(\S+)/i)
  
  if (match) {
    return {
      action: 'login',
      confidence: 0.95,
      entities: {
        description: `${match[1]}|${match[2]}` // email|password
      }
    }
  }

  return { action: 'login', confidence: 0.5, entities: {} }
}

function isLogoutIntent(doc: any): boolean {
  const logoutWords = ['sair', 'logout', 'desconectar', 'deslogar']
  const text = doc.text().toLowerCase()
  return logoutWords.some(word => text.includes(word))
}

function isHelpIntent(doc: any): boolean {
  const helpWords = ['ajuda', 'help', 'comandos', 'o que você faz', 'como usar']
  const text = doc.text().toLowerCase()
  return helpWords.some(word => text.includes(word))
}

function isExpenseIntent(doc: any, message: string): boolean {
  const expenseVerbs = ['gastei', 'gastar', 'paguei', 'pagar', 'comprei', 'comprar', 'despesa', 'adicionar despesa']
  const incomeVerbs = ['recebi', 'receber', 'ganhei', 'ganhar', 'receita', 'adicionar receita', 'entrou']
  const text = message.toLowerCase()
  
  return expenseVerbs.some(verb => text.includes(verb)) || 
         incomeVerbs.some(verb => text.includes(verb)) ||
         text.includes('adicionar') && (text.includes('despesa') || text.includes('receita'))
}

function parseExpense(doc: any, message: string, customDate?: Date): ParsedIntent {
  const entities: any = {}
  const text = message.toLowerCase()

  // Determine type
  const incomeVerbs = ['recebi', 'receber', 'ganhei', 'ganhar', 'receita', 'salário', 'entrou']
  const expenseVerbs = ['gastei', 'gastar', 'paguei', 'pagar', 'comprei', 'comprar', 'despesa', 'adicionar despesa']
  entities.type = expenseVerbs.some(verb => text.includes(verb)) ? 'expense' : 'income'

  // Extract amount
  entities.amount = extractAmount(message)

  // Extract category
  entities.category = extractCategory(message)

  // Extract date
  entities.date = extractDate(message, customDate)

  // Extract description (everything else)
  entities.description = extractDescription(message)

  const action = entities.type === 'income' ? 'add_income' : 'add_expense'
  const confidence = entities.amount ? 0.85 : 0.5

  return { action, confidence, entities }
}

function isBudgetIntent(doc: any, message: string): boolean {
  const budgetWords = ['orçamento', 'budget', 'limite', 'definir orçamento', 'mostrar orçamento']
  const text = message.toLowerCase()
  return budgetWords.some(word => text.includes(word))
}

function parseBudget(doc: any, message: string): ParsedIntent {
  const text = message.toLowerCase()
  
  // Check if it's showing budgets
  if (text.includes('mostrar') || text.includes('ver') || text.includes('listar') || text.includes('status')) {
    return { action: 'show_budget', confidence: 0.9, entities: {} }
  }

  // Setting budget
  const entities: any = {}
  entities.amount = extractAmount(message)
  entities.category = extractCategory(message)
  
  // Extract month/year if specified
  const monthMatch = message.match(/(\d{1,2})\/(\d{4})/)
  if (monthMatch) {
    entities.month = parseInt(monthMatch[1])
    entities.year = parseInt(monthMatch[2])
  }

  return { 
    action: 'set_budget', 
    confidence: entities.amount && entities.category ? 0.85 : 0.6, 
    entities 
  }
}

function isRecurringIntent(doc: any, message: string): boolean {
  const recurringWords = ['recorrente', 'mensal', 'todo mês', 'recurring', 'fixa', 'fixo']
  const text = message.toLowerCase()
  return recurringWords.some(word => text.includes(word))
}

function parseRecurring(doc: any, message: string): ParsedIntent {
  const text = message.toLowerCase()

  // Check if showing recurring
  if (text.includes('mostrar') || text.includes('ver') || text.includes('listar')) {
    return { action: 'show_recurring', confidence: 0.9, entities: {} }
  }

  // Check if deleting
  if (text.includes('deletar') || text.includes('remover') || text.includes('cancelar')) {
    return { action: 'delete_recurring', confidence: 0.8, entities: {} }
  }

  // Adding recurring
  const entities: any = {}
  entities.amount = extractAmount(message)
  entities.category = extractCategory(message)
  
  // Extract day of month
  const dayMatch = message.match(/dia\s+(\d{1,2})/i) || 
                   message.match(/no\s+(\d{1,2})/i) ||
                   message.match(/todo\s+dia\s+(\d{1,2})/i)
  
  if (dayMatch) {
    entities.dayOfMonth = parseInt(dayMatch[1])
  }

  // Type
  entities.type = text.includes('receita') || text.includes('recebi') ? 'income' : 'expense'

  return {
    action: 'add_recurring',
    confidence: entities.amount && entities.dayOfMonth ? 0.85 : 0.6,
    entities
  }
}

function isReportIntent(doc: any, message: string): boolean {
  const reportWords = ['relatório', 'relatorio', 'resumo', 'report', 'balanço', 'balanco', 'análise', 'analise']
  const text = message.toLowerCase()
  return reportWords.some(word => text.includes(word))
}

function parseReport(doc: any, message: string, customDate?: Date): ParsedIntent {
  const entities: any = {}
  const text = message.toLowerCase()

  // Extract month/year
  const monthMatch = message.match(/(\d{1,2})\/(\d{4})/)
  if (monthMatch) {
    entities.month = parseInt(monthMatch[1])
    entities.year = parseInt(monthMatch[2])
  } else if (text.includes('este mês') || text.includes('esse mês') || text.includes('mês atual')) {
    const now = customDate || new Date()
    const month = now.getMonth()
    const year = now.getFullYear()
    if (!isNaN(month) && !isNaN(year)) {
      entities.month = month + 1
      entities.year = year
    }
  } else if (text.includes('mês passado') || text.includes('último mês')) {
    const now = customDate || new Date()
    const lastMonth = new Date(now)
    lastMonth.setMonth(lastMonth.getMonth() - 1)
    const month = lastMonth.getMonth()
    const year = lastMonth.getFullYear()
    if (!isNaN(month) && !isNaN(year)) {
      entities.month = month + 1
      entities.year = year
    }
  } else {
    // Parse month names
    const monthNames: { [key: string]: number } = {
      'janeiro': 1, 'fevereiro': 2, 'março': 3, 'abril': 4, 'maio': 5, 'junho': 6,
      'julho': 7, 'agosto': 8, 'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12
    }
    
    for (const [monthName, monthNum] of Object.entries(monthNames)) {
      if (text.includes(monthName)) {
        entities.month = monthNum
        break
      }
    }
    
    // Extract year if present
    const yearMatch = message.match(/(\d{4})/)
    if (yearMatch) {
      entities.year = parseInt(yearMatch[1])
    }
  }

  return { action: 'show_report', confidence: 0.9, entities }
}

function isCategoryIntent(doc: any, message: string): boolean {
  const categoryWords = ['categoria', 'categorias', 'category']
  const text = message.toLowerCase()
  return categoryWords.some(word => text.includes(word))
}

function parseCategory(doc: any, message: string): ParsedIntent {
  const text = message.toLowerCase()

  // Check if listing
  if (text.includes('listar') || text.includes('mostrar') || text.includes('ver')) {
    return { action: 'list_categories', confidence: 0.9, entities: {} }
  }

  // Adding category
  if (text.includes('adicionar') || text.includes('criar') || text.includes('nova')) {
    const entities: any = {}
    
    // Extract category name (after "adicionar categoria", "criar categoria", etc)
    const match = message.match(/(?:adicionar|criar|nova)\s+categoria\s+(.+)/i)
    if (match) {
      entities.category = match[1].trim()
    }

    return { action: 'add_category', confidence: 0.8, entities }
  }

  return { action: 'list_categories', confidence: 0.7, entities: {} }
}

function extractAmount(message: string): number | undefined {
  // Try to extract R$ format
  let match = message.match(/R\$?\s*(\d+(?:[.,]\d{1,2})?)/)
  if (match) {
    return parseFloat(match[1].replace(',', '.'))
  }

  // Try to extract "X reais/real"
  match = message.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:reais|real)/i)
  if (match) {
    return parseFloat(match[1].replace(',', '.'))
  }

  // Try to extract just numbers
  match = message.match(/(\d+(?:[.,]\d{1,2})?)/)
  if (match) {
    return parseFloat(match[1].replace(',', '.'))
  }

  return undefined
}

function extractCategory(message: string): string | undefined {
  const categories = [
    'salário', 'salario', 'freelance', 'investimento', 'investimentos',
    'comida', 'alimentação', 'alimentacao', 'transporte', 'uber', 'taxi',
    'compras', 'shopping', 'entretenimento', 'lazer', 'contas', 'conta',
    'saúde', 'saude', 'médico', 'medico', 'educação', 'educacao',
    'aluguel', 'assinatura', 'assinaturas', 'netflix', 'spotify',
    'academia', 'gym', 'restaurante', 'mercado', 'supermercado'
  ]

  const text = message.toLowerCase()
  
  for (const cat of categories) {
    if (text.includes(cat)) {
      return cat
    }
  }

  // Try to extract from "em CATEGORY" or "de CATEGORY"
  const match = message.match(/(?:em|de|para|com)\s+([a-záàâãéèêíïóôõöúçñ]+)/i)
  if (match && !['ontem', 'hoje', 'dia', 'mês', 'mes', 'ano'].includes(match[1].toLowerCase())) {
    return match[1]
  }

  return undefined
}

function extractDate(message: string, customDate?: Date): string | undefined {
  const text = message.toLowerCase()
  const now = customDate || new Date()

  // Check for "hoje"
  if (text.includes('hoje') || text.includes('hj')) {
    return now.toISOString().split('T')[0]
  }

  // Check for "ontem"
  if (text.includes('ontem')) {
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    return yesterday.toISOString().split('T')[0]
  }

  // Check for date format DD/MM/YYYY or DD/MM
  let match = message.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (match) {
    const day = match[1].padStart(2, '0')
    const month = match[2].padStart(2, '0')
    const year = match[3]
    return `${year}-${month}-${day}`
  }

  match = message.match(/(\d{1,2})\/(\d{1,2})/)
  if (match) {
    const day = match[1].padStart(2, '0')
    const month = match[2].padStart(2, '0')
    // Use next year if the date is in the past
    let year = now.getFullYear()
    const parsedDate = new Date(`${year}-${month}-${day}`)
    if (parsedDate < now) {
      year = year + 1
    }
    return `${year}-${month}-${day}`
  }

  return undefined
}

function extractDescription(message: string): string {
  // Remove common command words and keep the rest as description
  let description = message
    .replace(/gastei|gastar|paguei|pagar|comprei|comprar|recebi|receber/gi, '')
    .replace(/R\$?\s*\d+(?:[.,]\d{1,2})?/g, '')
    .replace(/\d+(?:[.,]\d{1,2})?\s*(?:reais|real)/gi, '')
    .replace(/em|de|para|com|ontem|hoje/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  return description || ''
}

