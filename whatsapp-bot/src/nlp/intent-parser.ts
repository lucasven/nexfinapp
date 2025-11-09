import nlp from 'compromise'
import numbers from 'compromise-numbers'
import { ParsedIntent } from '../types'

nlp.extend(numbers)

export function parseIntent(message: string, customDate?: Date): ParsedIntent {
  // FIRST: Check for explicit commands (highest priority - confidence 0.95+)
  if (message.trim().startsWith('/')) {
    const commandResult = parseExplicitCommand(message, customDate)
    if (commandResult) {
      return commandResult
    }
  }

  // SECOND: Natural language parsing
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

// ============================================================================
// EXPLICIT COMMAND PARSING (from command-parser.ts)
// ============================================================================

/**
 * Parse explicit commands starting with /
 * Returns null if not a valid command
 */
function parseExplicitCommand(message: string, customDate?: Date): ParsedIntent | null {
  const trimmed = message.trim()
  
  if (!trimmed.startsWith('/')) {
    return null
  }
  
  const parts = trimmed.split(/\s+/)
  const command = parts[0].substring(1).toLowerCase() // Remove the /
  const args = parts.slice(1)
  
  // Route to appropriate command parser
  switch (command) {
    case 'add':
      return parseAddCommand(args, customDate)
    case 'budget':
      return parseBudgetCommand(args)
    case 'recurring':
      return parseRecurringCommand(args)
    case 'report':
      return parseReportCommand(args, customDate)
    case 'list':
      return parseListCommand(args)
    case 'help':
      return parseHelpCommand(args)
    case 'categories':
      return parseCategoriesCommand(args)
    default:
      return null
  }
}

/**
 * Parse /add command: /add <valor> <categoria> [data] [descrição] [método_pagamento]
 */
function parseAddCommand(args: string[], customDate?: Date): ParsedIntent | null {
  if (args.length < 2) {
    return null
  }
  
  const amount = parseAmount(args[0])
  if (amount === null) {
    return null
  }
  
  const category = args[1]
  let date: string | undefined
  let description: string | undefined
  let paymentMethod: string | undefined
  
  // Parse remaining arguments
  for (let i = 2; i < args.length; i++) {
    const arg = args[i]
    
    // Check if it's a date (DD/MM/YYYY or DD/MM)
    if (isDateFormat(arg)) {
      date = parseDateString(arg, customDate)
    }
    // Check if it's a payment method
    else if (isPaymentMethod(arg)) {
      paymentMethod = arg
    }
    // Otherwise, it's part of the description
    else {
      description = description ? `${description} ${arg}` : arg
    }
  }
  
  return {
    action: 'add_expense',
    confidence: 0.95,
    entities: {
      amount,
      category,
      description: description || category,
      date,
      paymentMethod: paymentMethod
    }
  }
}

/**
 * Parse /budget command: /budget <categoria> <valor> [mes/ano]
 */
function parseBudgetCommand(args: string[]): ParsedIntent | null {
  if (args.length < 2) {
    return null
  }
  
  const category = args[0]
  const amount = parseAmount(args[1])
  
  if (amount === null) {
    return null
  }
  
  let period: string | undefined
  if (args.length > 2) {
    period = args.slice(2).join(' ')
  }
  
  return {
    action: 'set_budget',
    confidence: 0.95,
    entities: {
      category,
      amount,
      description: period
    }
  }
}

/**
 * Parse /recurring command: /recurring <nome> <valor> dia <dia>
 */
function parseRecurringCommand(args: string[]): ParsedIntent | null {
  if (args.length < 4) {
    return null
  }
  
  const name = args[0]
  const amount = parseAmount(args[1])
  
  if (amount === null) {
    return null
  }
  
  // Look for "dia" keyword
  const diaIndex = args.findIndex(arg => arg.toLowerCase() === 'dia')
  if (diaIndex === -1 || diaIndex + 1 >= args.length) {
    return null
  }
  
  const day = parseInt(args[diaIndex + 1])
  if (isNaN(day) || day < 1 || day > 31) {
    return null
  }
  
  return {
    action: 'add_recurring',
    confidence: 0.95,
    entities: {
      description: name,
      amount,
      date: day.toString()
    }
  }
}

/**
 * Parse /report command: /report [mes] [ano] [categoria]
 */
function parseReportCommand(args: string[], customDate?: Date): ParsedIntent | null {
  let period: string | undefined
  let category: string | undefined
  
  if (args.length > 0) {
    // Check if first arg is a month name or number
    if (isMonth(args[0])) {
      period = args[0]
      if (args.length > 1 && isYear(args[1])) {
        period = `${period} ${args[1]}`
        if (args.length > 2) {
          category = args.slice(2).join(' ')
        }
      } else if (args.length > 1) {
        category = args.slice(1).join(' ')
      }
    } else {
      category = args.join(' ')
    }
  }
  
  return {
    action: 'show_report',
    confidence: 0.95,
    entities: {
      description: period || 'este mês',
      category
    }
  }
}

/**
 * Parse /list command: /list [categories|recurring|budgets|transactions]
 */
function parseListCommand(args: string[]): ParsedIntent | null {
  const type = args.length > 0 ? args[0].toLowerCase() : 'default'
  
  const validTypes = ['categories', 'recurring', 'budgets', 'transactions']
  if (args.length > 0 && !validTypes.includes(type)) {
    return null
  }
  
  // Map list types to their corresponding actions
  const actionMap: { [key: string]: string } = {
    'categories': 'list_categories',
    'recurring': 'list_recurring',
    'budgets': 'list_budgets',
    'transactions': 'list_transactions',
    'default': 'show_expenses' // Default when no arguments provided
  }
  
  return {
    action: actionMap[type],
    confidence: 0.95,
    entities: {}
  } as ParsedIntent
}

/**
 * Parse /help command: /help [comando]
 */
function parseHelpCommand(args: string[]): ParsedIntent | null {
  const command = args.length > 0 ? args[0].toLowerCase() : undefined
  
  return {
    action: 'help',
    confidence: 0.95,
    entities: {
      description: command
    }
  } as ParsedIntent
}

/**
 * Parse /categories command: /categories [add|remove] [nome]
 */
function parseCategoriesCommand(args: string[]): ParsedIntent | null {
  if (args.length === 0) {
    return {
      action: 'list_categories',
      confidence: 0.95,
      entities: {}
    }
  }
  
  const action = args[0].toLowerCase()
  const name = args.length > 1 ? args.slice(1).join(' ') : undefined
  
  if (action === 'add' && name) {
    return {
      action: 'add_category',
      confidence: 0.95,
      entities: {
        category: name
      }
    }
  }
  
  return null
}

/**
 * Get help text for commands
 * Uses default Portuguese locale for now
 * TODO: Accept locale parameter when handlers support dynamic locales
 */
export function getCommandHelp(command?: string): string {
  // Import here to avoid circular dependencies
  const { messages } = require('../localization/pt-br')
  
  const helpTexts = messages.commandHelp
  
  if (command && command in helpTexts) {
    return helpTexts[command as keyof typeof helpTexts]
  }
  
  return helpTexts.help
}

// ============================================================================
// COMMAND HELPER FUNCTIONS
// ============================================================================

function parseAmount(amountStr: string): number | null {
  // Remove currency symbols and normalize
  const cleaned = amountStr.replace(/[R$\s]/g, '').replace(',', '.')
  const amount = parseFloat(cleaned)
  
  if (isNaN(amount) || amount <= 0) {
    return null
  }
  
  return amount
}

function isDateFormat(str: string): boolean {
  // Check for DD/MM/YYYY or DD/MM format
  return /^\d{1,2}\/\d{1,2}(\/\d{4})?$/.test(str)
}

function parseDateString(dateStr: string, customDate?: Date): string {
  const parts = dateStr.split('/')
  const day = parts[0].padStart(2, '0')
  const month = parts[1].padStart(2, '0')
  const year = parts[2] || (customDate || new Date()).getFullYear().toString()
  
  return `${year}-${month}-${day}`
}

function isPaymentMethod(str: string): boolean {
  const paymentMethods = [
    'dinheiro', 'cartão', 'cartao', 'pix', 'débito', 'debito', 'crédito', 'credito',
    'nubank', 'inter', 'itau', 'bradesco', 'santander', 'caixa', 'bb'
  ]
  
  return paymentMethods.some(method => 
    str.toLowerCase().includes(method.toLowerCase())
  )
}

function isMonth(str: string): boolean {
  const months = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
    'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
    'jul', 'ago', 'set', 'out', 'nov', 'dez'
  ]
  
  return months.includes(str.toLowerCase()) || 
         (parseInt(str) >= 1 && parseInt(str) <= 12)
}

function isYear(str: string): boolean {
  const year = parseInt(str)
  return !isNaN(year) && year >= 2000 && year <= 2100
}

// ============================================================================
// NATURAL LANGUAGE PARSING
// ============================================================================

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

  // Helper to get local date string (YYYY-MM-DD) without timezone conversion
  const getLocalDateString = (date: Date): string => {
    // Use local date components directly to avoid UTC conversion issues
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Check for "hoje"
  if (text.includes('hoje') || text.includes('hj')) {
    return getLocalDateString(now)
  }

  // Check for "ontem"
  if (text.includes('ontem')) {
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    return getLocalDateString(yesterday)
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
