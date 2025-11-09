/**
 * Intent Parser V2
 * Simplified parser that ONLY handles explicit commands (starting with /)
 * Natural language is handled by LLM in message handler
 */

import { ParsedIntent } from '../types'

/**
 * Parse explicit commands starting with /
 * Returns intent with high confidence if valid command, unknown otherwise
 */
export function parseIntent(message: string, customDate?: Date): ParsedIntent {
  const trimmed = message.trim()
  
  // Only handle explicit commands
  if (!trimmed.startsWith('/')) {
    return {
      action: 'unknown',
      confidence: 0,
      entities: {}
    }
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
      return {
        action: 'unknown',
        confidence: 0.3,
        entities: {}
      }
  }
}

/**
 * Parse /add command: /add <valor> <categoria> [data] [descrição] [método_pagamento]
 */
function parseAddCommand(args: string[], customDate?: Date): ParsedIntent {
  if (args.length < 2) {
    return {
      action: 'unknown',
      confidence: 0.5,
      entities: {}
    }
  }
  
  const amount = parseAmount(args[0])
  if (amount === null) {
    return {
      action: 'unknown',
      confidence: 0.5,
      entities: {}
    }
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
function parseBudgetCommand(args: string[]): ParsedIntent {
  if (args.length === 0) {
    return {
      action: 'show_budget',
      confidence: 0.95,
      entities: {}
    }
  }
  
  if (args.length < 2) {
    return {
      action: 'unknown',
      confidence: 0.5,
      entities: {}
    }
  }
  
  const category = args[0]
  const amount = parseAmount(args[1])
  
  if (amount === null) {
    return {
      action: 'unknown',
      confidence: 0.5,
      entities: {}
    }
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
function parseRecurringCommand(args: string[]): ParsedIntent {
  if (args.length === 0) {
    return {
      action: 'show_recurring',
      confidence: 0.95,
      entities: {}
    }
  }
  
  if (args.length < 4) {
    return {
      action: 'unknown',
      confidence: 0.5,
      entities: {}
    }
  }
  
  const name = args[0]
  const amount = parseAmount(args[1])
  
  if (amount === null) {
    return {
      action: 'unknown',
      confidence: 0.5,
      entities: {}
    }
  }
  
  // Look for "dia" keyword
  const diaIndex = args.findIndex(arg => arg.toLowerCase() === 'dia')
  if (diaIndex === -1 || diaIndex + 1 >= args.length) {
    return {
      action: 'unknown',
      confidence: 0.5,
      entities: {}
    }
  }
  
  const day = parseInt(args[diaIndex + 1])
  if (isNaN(day) || day < 1 || day > 31) {
    return {
      action: 'unknown',
      confidence: 0.5,
      entities: {}
    }
  }
  
  return {
    action: 'add_recurring',
    confidence: 0.95,
    entities: {
      description: name,
      amount,
      date: day.toString(),
      dayOfMonth: day
    }
  }
}

/**
 * Parse /report command: /report [mes] [ano] [categoria]
 */
function parseReportCommand(args: string[], customDate?: Date): ParsedIntent {
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
function parseListCommand(args: string[]): ParsedIntent {
  const type = args.length > 0 ? args[0].toLowerCase() : 'default'
  
  const validTypes = ['categories', 'recurring', 'budgets', 'transactions']
  if (args.length > 0 && !validTypes.includes(type)) {
    return {
      action: 'unknown',
      confidence: 0.5,
      entities: {}
    }
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
function parseHelpCommand(args: string[]): ParsedIntent {
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
function parseCategoriesCommand(args: string[]): ParsedIntent {
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
  
  return {
    action: 'list_categories',
    confidence: 0.7,
    entities: {}
  }
}

/**
 * Get help text for commands
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
// HELPER FUNCTIONS
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

