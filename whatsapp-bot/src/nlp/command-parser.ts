import { ParsedIntent } from '../types'

export interface Command {
  type: 'add' | 'budget' | 'recurring' | 'report' | 'list' | 'help' | 'categories'
  args: string[]
  raw: string
}

/**
 * Parse explicit commands starting with /
 */
export function parseCommand(message: string): Command | null {
  const trimmed = message.trim()
  
  if (!trimmed.startsWith('/')) {
    return null
  }
  
  const parts = trimmed.split(/\s+/)
  const command = parts[0].substring(1).toLowerCase() // Remove the /
  const args = parts.slice(1)
  
  // Validate command type
  const validCommands = ['add', 'budget', 'recurring', 'report', 'list', 'help', 'categories']
  if (!validCommands.includes(command)) {
    return null
  }
  
  return {
    type: command as Command['type'],
    args,
    raw: message.trimStart() // Remove leading spaces but preserve trailing spaces
  }
}

/**
 * Execute a parsed command and return the appropriate intent
 */
export function executeCommand(command: Command): ParsedIntent | null {
  switch (command.type) {
    case 'add':
      return parseAddCommand(command.args)
    case 'budget':
      return parseBudgetCommand(command.args)
    case 'recurring':
      return parseRecurringCommand(command.args)
    case 'report':
      return parseReportCommand(command.args)
    case 'list':
      return parseListCommand(command.args)
    case 'help':
      return parseHelpCommand(command.args)
    case 'categories':
      return parseCategoriesCommand(command.args)
    default:
      return null
  }
}

/**
 * Parse /add command: /add <valor> <categoria> [data] [descrição] [método_pagamento]
 */
function parseAddCommand(args: string[]): ParsedIntent | null {
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
    if (isDate(arg)) {
      date = parseDate(arg)
    }
    // Check if it's a payment method (starts with uppercase or contains common payment terms)
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
    confidence: 1.0,
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
    confidence: 1.0,
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
    confidence: 1.0,
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
function parseReportCommand(args: string[]): ParsedIntent | null {
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
    confidence: 1.0,
    entities: {
      description: period || 'este mês',
      category
    }
  }
}

/**
 * Parse /list command: /list [categories|recurring|budgets]
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
    confidence: 1.0,
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
    confidence: 1.0,
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
      confidence: 1.0,
      entities: {}
    }
  }
  
  const action = args[0].toLowerCase()
  const name = args.length > 1 ? args.slice(1).join(' ') : undefined
  
  if (action === 'add' && name) {
    return {
      action: 'add_category',
      confidence: 1.0,
      entities: {
        category: name
      }
    }
  } else if (action === 'remove' && name) {
    // For now, map remove to add_category since remove_category is not in the type
    return {
      action: 'add_category',
      confidence: 1.0,
      entities: {
        category: name
      }
    } as ParsedIntent
  }
  
  return null
}

// Helper functions

function parseAmount(amountStr: string): number | null {
  // Remove currency symbols and normalize
  const cleaned = amountStr.replace(/[R$\s]/g, '').replace(',', '.')
  const amount = parseFloat(cleaned)
  
  if (isNaN(amount) || amount <= 0) {
    return null
  }
  
  return amount
}

function isDate(str: string): boolean {
  // Check for DD/MM/YYYY or DD/MM format
  return /^\d{1,2}\/\d{1,2}(\/\d{4})?$/.test(str)
}

function parseDate(dateStr: string): string {
  const parts = dateStr.split('/')
  const day = parts[0].padStart(2, '0')
  const month = parts[1].padStart(2, '0')
  const year = parts[2] || new Date().getFullYear().toString()
  
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

/**
 * Get help text for commands
 */
export function getCommandHelp(command?: string): string {
  const helpTexts = {
    add: `
/add <valor> <categoria> [data] [descrição] [método_pagamento]

Exemplos:
/add 50 comida
/add 30 transporte 15/10
/add 100 mercado ontem cartão
/add 25.50 farmácia "compras de remédios" pix
    `,
    budget: `
/budget <categoria> <valor> [período]

Exemplos:
/budget comida 500
/budget transporte 200 mês
/budget lazer 1000 ano
    `,
    recurring: `
/recurring <nome> <valor> dia <dia>

Exemplos:
/recurring aluguel 1200 dia 5
/recurring salário 5000 dia 1
/recurring academia 80 dia 15
    `,
    report: `
/report [período] [categoria]

Exemplos:
/report
/report este mês
/report janeiro 2024
/report comida
    `,
    list: `
/list [tipo]

Tipos: categories, recurring, budgets, transactions

Exemplos:
/list
/list categories
/list recurring
    `,
    categories: `
/categories [ação] [nome]

Ações: add, remove

Exemplos:
/categories
/categories add "casa e decoração"
/categories remove transporte
    `,
    help: `
Comandos disponíveis:

/add - Adicionar despesa
/budget - Definir orçamento
/recurring - Adicionar despesa recorrente
/report - Ver relatórios
/list - Listar itens
/categories - Gerenciar categorias
/help - Mostrar esta ajuda

Use /help <comando> para detalhes específicos.
    `
  }
  
  if (command && command in helpTexts) {
    return helpTexts[command as keyof typeof helpTexts]
  }
  
  return helpTexts.help
}
