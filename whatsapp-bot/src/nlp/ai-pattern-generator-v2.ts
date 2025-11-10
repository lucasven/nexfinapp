/**
 * AI Pattern Generator V2
 * Uses OpenAI Function Calling for structured intent parsing
 */

import OpenAI from 'openai'
import { getSupabaseClient } from '../services/supabase-client.js'
import { ParsedIntent } from '../types.js'
import { logger } from '../services/logger.js'
import { checkDailyLimit, recordLLMUsage } from '../services/ai-usage-tracker.js'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export interface UserContext {
  userId: string
  recentCategories: string[]
  recentPaymentMethods: string[]
  userPreferences: any
}

// Define function schemas for OpenAI function calling
const EXPENSE_TOOL = {
  type: 'function' as const,
  function: {
    name: 'add_expense_or_income',
    description: 'Register a new expense or income transaction',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add_expense', 'add_income'],
          description: 'Type of transaction'
        },
        amount: {
          type: 'number',
          description: 'Amount in local currency'
        },
        category: {
          type: 'string',
          description: 'Category of the transaction'
        },
        description: {
          type: 'string',
          description: 'Description or notes about the transaction'
        },
        date: {
          type: 'string',
          format: 'date',
          description: 'Transaction date in YYYY-MM-DD format'
        },
        payment_method: {
          type: 'string',
          description: 'Payment method used (e.g., credit card, cash, PIX)'
        },
        transactions: {
          type: 'array',
          description: 'Multiple transactions if mentioned in one message',
          items: {
            type: 'object',
            properties: {
              amount: { type: 'number' },
              category: { type: 'string' },
              description: { type: 'string' },
              date: { type: 'string', format: 'date' },
              payment_method: { type: 'string' }
            },
            required: ['amount']
          }
        }
      },
      required: ['action', 'amount']
    }
  }
}

const BUDGET_TOOL = {
  type: 'function' as const,
  function: {
    name: 'manage_budget',
    description: 'Set or view budget information',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['set_budget', 'show_budget'],
          description: 'Budget action to perform'
        },
        category: {
          type: 'string',
          description: 'Category for the budget'
        },
        amount: {
          type: 'number',
          description: 'Budget amount'
        },
        period: {
          type: 'string',
          description: 'Time period for the budget'
        }
      },
      required: ['action']
    }
  }
}

const RECURRING_TOOL = {
  type: 'function' as const,
  function: {
    name: 'manage_recurring',
    description: 'Manage recurring payments',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add_recurring', 'show_recurring', 'delete_recurring'],
          description: 'Recurring payment action'
        },
        description: {
          type: 'string',
          description: 'Description of the recurring payment'
        },
        amount: {
          type: 'number',
          description: 'Amount of the recurring payment'
        },
        day_of_month: {
          type: 'integer',
          description: 'Day of month for the recurring payment (1-31)'
        }
      },
      required: ['action']
    }
  }
}

const REPORT_TOOL = {
  type: 'function' as const,
  function: {
    name: 'show_report',
    description: 'Generate financial report',
    parameters: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          description: 'Time period for the report (e.g., "this month", "last month", "janeiro")'
        },
        category: {
          type: 'string',
          description: 'Specific category to filter by'
        }
      },
      required: []
    }
  }
}

const LIST_TOOL = {
  type: 'function' as const,
  function: {
    name: 'list_items',
    description: 'List transactions, categories, budgets, or recurring payments',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['transactions', 'categories', 'budgets', 'recurring'],
          description: 'Type of items to list'
        }
      },
      required: ['type']
    }
  }
}

const HELP_TOOL = {
  type: 'function' as const,
  function: {
    name: 'show_help',
    description: 'Show help information or command documentation',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Specific command to get help about'
        }
      },
      required: []
    }
  }
}

// NEW: Transaction Management Tools

const TRANSACTION_EDIT_TOOL = {
  type: 'function' as const,
  function: {
    name: 'edit_transaction',
    description: 'Edit an existing transaction (amount, category, description, date, payment method)',
    parameters: {
      type: 'object',
      properties: {
        transaction_id: { 
          type: 'string', 
          description: '6-character transaction ID (e.g. ABC123). Can be extracted from quoted message with format [transaction_id: ABC123].'
        },
        amount: { type: 'number', description: 'New amount' },
        category: { type: 'string', description: 'New category name' },
        description: { type: 'string', description: 'New description' },
        date: { type: 'string', format: 'date', description: 'New date YYYY-MM-DD' },
        payment_method: { type: 'string', description: 'New payment method' }
      },
      required: ['transaction_id']
    }
  }
}

const TRANSACTION_DELETE_TOOL = {
  type: 'function' as const,
  function: {
    name: 'delete_transaction',
    description: 'Delete a transaction by ID',
    parameters: {
      type: 'object',
      properties: {
        transaction_id: { type: 'string', description: '6-character transaction ID' }
      },
      required: ['transaction_id']
    }
  }
}

const CHANGE_CATEGORY_TOOL = {
  type: 'function' as const,
  function: {
    name: 'change_category',
    description: 'Change or update the category of an existing transaction. Use this when user wants to modify the category of a transaction they created. The transaction ID should be in the message context or quoted message.',
    parameters: {
      type: 'object',
      properties: {
        transaction_id: { type: 'string', description: 'Transaction ID from quoted message or message context (format: ABC123)' },
        new_category: { type: 'string', description: 'New category name to assign to the transaction' }
      },
      required: ['transaction_id', 'new_category']
    }
  }
}

const CATEGORY_MANAGEMENT_TOOL = {
  type: 'function' as const,
  function: {
    name: 'manage_category',
    description: 'Add or remove custom categories',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'remove'] },
        category_name: { type: 'string' }
      },
      required: ['action', 'category_name']
    }
  }
}

const RECURRING_EDIT_TOOL = {
  type: 'function' as const,
  function: {
    name: 'edit_recurring',
    description: 'Edit a recurring payment',
    parameters: {
      type: 'object',
      properties: {
        recurring_name: { type: 'string', description: 'Name/description of recurring payment' },
        amount: { type: 'number' },
        day_of_month: { type: 'integer', minimum: 1, maximum: 31 }
      },
      required: ['recurring_name']
    }
  }
}

const MAKE_RECURRING_TOOL = {
  type: 'function' as const,
  function: {
    name: 'make_expense_recurring',
    description: 'Convert an expense to a recurring payment',
    parameters: {
      type: 'object',
      properties: {
        transaction_id: { type: 'string', description: 'Transaction ID to convert' },
        day_of_month: { type: 'integer', minimum: 1, maximum: 31, description: 'Day of month for recurring payment' }
      },
      required: ['transaction_id', 'day_of_month']
    }
  }
}

const QUICK_STATS_TOOL = {
  type: 'function' as const,
  function: {
    name: 'quick_stats',
    description: 'Show quick financial statistics for a period',
    parameters: {
      type: 'object',
      properties: {
        period: { 
          type: 'string', 
          enum: ['today', 'week', 'month'],
          description: 'Time period for statistics'
        }
      },
      required: ['period']
    }
  }
}

const ANALYZE_SPENDING_TOOL = {
  type: 'function' as const,
  function: {
    name: 'analyze_spending',
    description: 'AI-powered analysis of spending patterns with insights and recommendations. Use when user asks for analysis, insights, recommendations, or patterns in their spending.',
    parameters: {
      type: 'object',
      properties: {
        analysis_type: {
          type: 'string',
          enum: ['top_categories', 'trends', 'recommendations', 'budget_health', 'general'],
          description: 'Type of analysis to perform'
        }
      },
      required: []
    }
  }
}

const UNDO_TOOL = {
  type: 'function' as const,
  function: {
    name: 'undo_last',
    description: 'Undo the last action (transaction add, edit, or delete)',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  }
}

const DELETE_BUDGET_TOOL = {
  type: 'function' as const,
  function: {
    name: 'delete_budget',
    description: 'Delete a budget for a specific category',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Category name' },
        month: { type: 'integer', description: 'Month (1-12)' },
        year: { type: 'integer', description: 'Year' }
      },
      required: ['category']
    }
  }
}

/**
 * Parse message with AI using function calling
 */
export async function parseWithAI(
  message: string,
  context: UserContext,
  quotedMessage?: string
): Promise<ParsedIntent> {
  // Check daily limit before making API call
  const limitCheck = await checkDailyLimit(context.userId)
  if (!limitCheck.allowed) {
    logger.warn('Daily AI limit exceeded', { userId: context.userId })
    throw new Error('Daily AI usage limit exceeded')
  }
  
  const systemPrompt = createSystemPrompt(context)
  
  // Build messages array with quoted context if available
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt }
  ]
  
  if (quotedMessage) {
    messages.push({
      role: 'user',
      content: `Context (previous message): "${quotedMessage}"\n\nCurrent message: "${message}"`
    })
  } else {
    messages.push({ role: 'user', content: message })
  }
  
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools: [
        EXPENSE_TOOL,
        BUDGET_TOOL,
        RECURRING_TOOL,
        REPORT_TOOL,
        LIST_TOOL,
        HELP_TOOL,
        // NEW: Transaction Management
        TRANSACTION_EDIT_TOOL,
        TRANSACTION_DELETE_TOOL,
        CHANGE_CATEGORY_TOOL,
        CATEGORY_MANAGEMENT_TOOL,
        RECURRING_EDIT_TOOL,
        MAKE_RECURRING_TOOL,
        QUICK_STATS_TOOL,
        ANALYZE_SPENDING_TOOL,
        UNDO_TOOL,
        DELETE_BUDGET_TOOL
      ],
      tool_choice: 'auto',
      temperature: 0.1,
      max_tokens: 500
    })
    
    // Record usage
    const usage = completion.usage
    if (usage) {
      await recordLLMUsage(context.userId, {
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens
      })
    }
    
    const response = completion.choices[0].message
    
    // Check if function was called
    if (response.tool_calls && response.tool_calls.length > 0) {
      const toolCall = response.tool_calls[0]
      const functionName = toolCall.function.name
      const args = JSON.parse(toolCall.function.arguments)
      
      logger.debug('Function called by AI', {
        userId: context.userId,
        function: functionName,
        args
      })
      
      return convertFunctionCallToIntent(functionName, args)
    }
    
    // No function called - unknown intent
    logger.warn('AI did not call any function', {
      userId: context.userId,
      message,
      response: response.content
    })
    
    return {
      action: 'unknown',
      confidence: 0.3,
      entities: {}
    }
  } catch (error) {
    logger.error('Error in parseWithAI', { userId: context.userId, message }, error as Error)
    throw error
  }
}

/**
 * Convert function call to ParsedIntent
 */
function convertFunctionCallToIntent(functionName: string, args: any): ParsedIntent {
  let intent: ParsedIntent
  
  switch (functionName) {
    case 'add_expense_or_income':
      // Handle multiple transactions
      if (args.transactions && args.transactions.length > 0) {
        intent = {
          action: args.action || 'add_expense',
          confidence: 0.95,
          entities: {
            transactions: args.transactions.map((tx: any) => ({
              amount: tx.amount,
              category: tx.category,
              description: tx.description || tx.category,
              date: tx.date,
              paymentMethod: tx.payment_method
            }))
          }
        }
      } else {
        // Single transaction
        intent = {
          action: args.action,
          confidence: 0.95,
          entities: {
            amount: args.amount,
            category: args.category,
            description: args.description || args.category,
            date: args.date,
            paymentMethod: args.payment_method,
            type: args.action === 'add_income' ? 'income' : 'expense'
          }
        }
      }
      break
      
    case 'manage_budget':
      intent = {
        action: args.action,
        confidence: 0.95,
        entities: {
          category: args.category,
          amount: args.amount,
          description: args.period
        }
      }
      break
      
    case 'manage_recurring':
      intent = {
        action: args.action,
        confidence: 0.95,
        entities: {
          description: args.description,
          amount: args.amount,
          dayOfMonth: args.day_of_month,
          date: args.day_of_month?.toString()
        }
      }
      break
      
    case 'show_report':
      intent = {
        action: 'show_report',
        confidence: 0.95,
        entities: {
          description: args.period,
          category: args.category
        }
      }
      break
      
    case 'list_items':
      const actionMap: { [key: string]: ParsedIntent['action'] } = {
        'transactions': 'list_transactions',
        'categories': 'list_categories',
        'budgets': 'list_budgets',
        'recurring': 'list_recurring'
      }
      intent = {
        action: actionMap[args.type] || 'show_expenses',
        confidence: 0.95,
        entities: {}
      }
      break
      
    case 'show_help':
      intent = {
        action: 'help',
        confidence: 0.95,
        entities: {
          description: args.command
        }
      }
      break
    
    // NEW: Transaction Management Cases
    case 'edit_transaction':
      intent = {
        action: 'edit_transaction',
        confidence: 0.95,
        entities: {
          transactionId: args.transaction_id,
          amount: args.amount,
          category: args.category,
          description: args.description,
          date: args.date,
          paymentMethod: args.payment_method
        }
      }
      break

    case 'delete_transaction':
      intent = {
        action: 'delete_transaction',
        confidence: 0.95,
        entities: { transactionId: args.transaction_id }
      }
      break

    case 'change_category':
      intent = {
        action: 'change_category',
        confidence: 0.95,
        entities: {
          transactionId: args.transaction_id,
          category: args.new_category
        }
      }
      break

    case 'manage_category':
      intent = {
        action: args.action === 'add' ? 'add_category' : 'remove_category',
        confidence: 0.95,
        entities: { category: args.category_name }
      }
      break

    case 'edit_recurring':
      intent = {
        action: 'edit_recurring',
        confidence: 0.95,
        entities: {
          description: args.recurring_name,
          amount: args.amount,
          dayOfMonth: args.day_of_month
        }
      }
      break

    case 'make_expense_recurring':
      intent = {
        action: 'make_expense_recurring',
        confidence: 0.95,
        entities: {
          transactionId: args.transaction_id,
          dayOfMonth: args.day_of_month
        }
      }
      break

    case 'quick_stats':
      intent = {
        action: 'quick_stats',
        confidence: 0.95,
        entities: { period: args.period }
      }
      break

    case 'analyze_spending':
      intent = {
        action: 'analyze_spending',
        confidence: 0.95,
        entities: { analysisType: args.analysis_type || 'general' }
      }
      break

    case 'undo_last':
      intent = {
        action: 'undo_last',
        confidence: 0.95,
        entities: {}
      }
      break

    case 'delete_budget':
      intent = {
        action: 'delete_budget',
        confidence: 0.95,
        entities: {
          category: args.category,
          month: args.month,
          year: args.year
        }
      }
      break
      
    default:
      intent = {
        action: 'unknown',
        confidence: 0.5,
        entities: {}
      }
  }
  
  return intent
}

/**
 * Create system prompt with user context
 */
function createSystemPrompt(context: UserContext): string {
  const today = new Date().toLocaleDateString('pt-BR', { 
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
  
  return `You are a financial assistant for a WhatsApp expense tracking bot. You speak Portuguese (Brazil).

Your task is to understand user messages about expenses, income, budgets, and financial reports, then call the appropriate function with the extracted data.

AVAILABLE CATEGORIES (custom categories listed first): ${context.recentCategories.join(', ')}
COMMON PAYMENT METHODS: ${context.recentPaymentMethods.join(', ')}
TODAY'S DATE: ${today}

IMPORTANT RULES:
1. For expense/income messages, extract: amount, category, description, date, payment method
2. For dates: "hoje" = today, "ontem" = yesterday, "DD/MM" or "DD/MM/YYYY" = specific date
3. For amounts: accept "50", "R$ 50", "50 reais", convert to number
4. If multiple transactions in one message, use the transactions array
5. Default to "add_expense" unless income is explicitly mentioned (recebi, ganhei, salário, etc.)
6. If uncertain, make best guess based on context
7. When user replies to previous message (context provided), consider both messages together
8. **TRANSACTION REPLIES**: If message contains [transaction_id: ABC123], extract the ID and use it for edit/delete/change operations
9. **CATEGORY CHANGES**: "mudar categoria", "alterar categoria", "trocar categoria" = change_category (NOT list_items!)
10. **CATEGORY MATCHING**: Prioritize user's custom categories (listed first) over default ones when matching descriptions. If a description could match multiple categories, prefer the custom one.

EXAMPLES:
"gastei 50 em comida" → add_expense_or_income(action="add_expense", amount=50, category="comida")
"paguei 30 de uber com cartão" → add_expense_or_income(amount=30, category="transporte", description="uber", payment_method="cartão")
"comprei 25 no mercado e 15 na farmácia" → add_expense_or_income(transactions=[{amount:25, category:"mercado"}, {amount:15, category:"farmácia"}])
"recebi 5000 de salário" → add_expense_or_income(action="add_income", amount=5000, category="salário")
"listar gastos" → list_items(type="transactions")
"listar categorias" → list_items(type="categories")
"relatório do mês" → show_report(period="this month")
"mudar categoria para outros [transaction_id: ABC123]" → change_category(transaction_id="ABC123", new_category="outros")
"alterar para mercado [transaction_id: XYZ789]" → change_category(transaction_id="XYZ789", new_category="mercado")

Call the most appropriate function based on the user's intent.`
}

/**
 * Get user context for AI parsing
 */
export async function getUserContext(userId: string): Promise<UserContext> {
  const supabase = getSupabaseClient()
  
  // Fetch actual category names from categories table
  const { data: allCategories } = await supabase
    .from('categories')
    .select('name, is_custom, user_id')
    .or(`user_id.eq.${userId},is_custom.eq.false`)
    .order('is_custom', { ascending: false }) // Custom categories first
    .order('name', { ascending: true })
  
  // Custom categories first, then default ones
  const customCategories = allCategories?.filter(c => c.is_custom && c.user_id === userId).map(c => c.name) || []
  const defaultCategories = allCategories?.filter(c => !c.is_custom).map(c => c.name) || []
  const recentCategories = [...customCategories, ...defaultCategories]
  
  // Get recent payment methods
  const { data: recentPaymentMethods } = await supabase
    .from('transactions')
    .select('payment_method')
    .eq('user_id', userId)
    .not('payment_method', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10)
    
  const recentPaymentMethodsList = [...new Set(
    recentPaymentMethods?.map(t => t.payment_method).filter(Boolean) || []
  )]
  
  // Get user preferences
  const { data: preferences } = await supabase
    .from('payment_method_preferences')
    .select('*')
    .eq('user_id', userId)
    .order('usage_count', { ascending: false })
    .limit(10)
    
  return {
    userId,
    recentCategories,
    recentPaymentMethods: recentPaymentMethodsList,
    userPreferences: preferences || []
  }
}

