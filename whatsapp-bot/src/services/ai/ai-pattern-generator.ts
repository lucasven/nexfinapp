/**
 * AI Pattern Generator V2
 * Uses OpenAI Function Calling for structured intent parsing
 */

import OpenAI from 'openai'
import { getSupabaseClient } from '../database/supabase-client.js'
import { ParsedIntent } from '../../types.js'
import { logger } from '../monitoring/logger.js'
import { checkDailyLimit, recordLLMUsage } from './ai-usage-tracker.js'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export interface UserContext {
  userId: string
  recentCategories: string[]
  recentPaymentMethods: string[]
  userPreferences: any
  categoryTypeMap: Map<string, 'income' | 'expense'>
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
          description: 'REQUIRED when multiple transactions detected (2+ amounts in message). Use this instead of single amount/category/description fields. Extract ALL transactions from the message.',
          items: {
            type: 'object',
            properties: {
              amount: { type: 'number', description: 'Transaction amount' },
              type: {
                type: 'string',
                enum: ['income', 'expense'],
                description: 'Transaction type: "income" for money received, "expense" for money spent'
              },
              category: { type: 'string', description: 'Transaction category' },
              description: { type: 'string', description: 'Merchant or transaction description' },
              date: { type: 'string', format: 'date', description: 'Transaction date in YYYY-MM-DD' },
              payment_method: { type: 'string', description: 'Payment method if known' }
            },
            required: ['amount', 'type']
          }
        }
      },
      required: ['action']
    }
  }
}

const BUDGET_TOOL = {
  type: 'function' as const,
  function: {
    name: 'manage_budget',
    description: 'Set or view budget information. Can set a fixed default budget for a category (applies to all months) or a monthly override.',
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
          description: 'Time period for the budget (for monthly budgets)'
        },
        is_default: {
          type: 'boolean',
          description: 'True if this should be a default/fixed budget applying to all months. Set to true when user says "fixo", "sempre", "todo mês", "fixed", "every month".'
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
    description: 'Edit an existing transaction (amount, category, description, date, payment method, type)',
    parameters: {
      type: 'object',
      properties: {
        transaction_id: {
          type: 'string',
          description: '6-character transaction ID (e.g. ABC123). Can be extracted from quoted message with format [transaction_id: ABC123].'
        },
        type: {
          type: 'string',
          enum: ['income', 'expense'],
          description: 'Change transaction type (despesa/expense or receita/income)'
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
    description: 'Delete a budget for a specific category. Can delete either a default/fixed budget or a monthly budget.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Category name' },
        month: { type: 'integer', description: 'Month (1-12) - only for monthly budgets' },
        year: { type: 'integer', description: 'Year - only for monthly budgets' },
        is_default: {
          type: 'boolean',
          description: 'True if deleting a default/fixed budget. Set to true when user says "fixo", "padrão", "default".'
        }
      },
      required: ['category']
    }
  }
}

// NEW: Installment (Parcelamento) Tool for Epic 2 Story 2.1
const INSTALLMENT_TOOL = {
  type: 'function' as const,
  function: {
    name: 'create_installment',
    description: 'Create an installment purchase plan (parcelamento). Used when user mentions buying something in installments like "gastei 600 em 3x" or "comprei 450 parcelado em 9 vezes".',
    parameters: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Total amount of the installment purchase'
        },
        installments: {
          type: 'integer',
          description: 'Number of installments (1-60)',
          minimum: 1,
          maximum: 60
        },
        description: {
          type: 'string',
          description: 'Description of what was purchased (e.g., "celular", "notebook")'
        },
        merchant: {
          type: 'string',
          description: 'Merchant name if mentioned'
        },
        first_payment_date: {
          type: 'string',
          format: 'date',
          description: 'First payment date in YYYY-MM-DD format. Defaults to today if not specified.'
        }
      },
      required: ['amount', 'installments']
    }
  }
}

// NEW: Future Commitments Tool for Epic 2 Story 2.3
const FUTURE_COMMITMENTS_TOOL = {
  type: 'function' as const,
  function: {
    name: 'view_future_commitments',
    description: 'View future installment payment commitments. Used when user asks about upcoming installments, future commitments, or wants to see what they\'ll owe in future months. Patterns: "parcelamentos", "/parcelamentos", "próximas parcelas", "future commitments", "/installments".',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  }
}

// NEW: Payoff Installment Tool for Epic 2 Story 2.5
const PAYOFF_INSTALLMENT_TOOL = {
  type: 'function' as const,
  function: {
    name: 'payoff_installment',
    description: 'Pay off an active installment early (quitação antecipada). Used when user wants to pay off remaining installments early. Patterns: "quitar parcelamento", "pagar resto do notebook", "quitação antecipada", "pay off installment", "quitar parcelas".',
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Optional description or keyword to identify which installment to pay off (e.g., "celular", "notebook"). If not provided, will show list of all active installments.'
        }
      },
      required: []
    }
  }
}

// NEW: Delete Installment Tool for Epic 2 Story 2.7
const DELETE_INSTALLMENT_TOOL = {
  type: 'function' as const,
  function: {
    name: 'delete_installment',
    description: 'Permanently delete an installment plan. Used when user wants to remove an installment completely. Patterns: "deletar parcelamento", "excluir parcelas do celular", "remover parcelamento", "apagar compra parcelada", "delete installment", "remove installment". Different from payoff - this removes the plan entirely.',
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Optional description or keyword to identify which installment to delete (e.g., "celular", "notebook", "iPhone"). If not provided, will show list of all installments for user to choose.'
        }
      },
      required: []
    }
  }
}

// NEW: Statement Summary Tool for Epic 3 Story 3.5
const STATEMENT_SUMMARY_TOOL = {
  type: 'function' as const,
  function: {
    name: 'view_statement_summary',
    description: 'View credit card statement summary with category breakdown. Shows current statement period spending by category with installment details. Use when user asks about statement summary, spending breakdown, or where their money went. Patterns: "resumo da fatura", "statement summary", "resumo", "fatura", "resumo do cartão", "gastos por categoria", "onde gastei", "breakdown de gastos", "view statement", "show statement summary".',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  }
}

// NEW: Credit Mode Switch Tool for Epic 1 Story 1.5
const CREDIT_MODE_SWITCH_TOOL = {
  type: 'function' as const,
  function: {
    name: 'switch_credit_mode',
    description: 'Switch a credit card between Credit Mode and Simple Mode. Credit Mode enables installments, statement tracking, and budget management. Simple Mode is basic expense tracking. Use when user wants to enable/disable credit mode, switch modes, or activate credit card features. Patterns: "mudar para modo crédito", "switch to credit mode", "ativar modo crédito", "enable credit mode", "desativar modo crédito", "disable credit mode", "mudar para modo simples", "switch to simple mode", "credit mode on", "credit mode off".',
    parameters: {
      type: 'object',
      properties: {
        target_mode: {
          type: 'string',
          enum: ['credit', 'simple'],
          description: 'Target mode: "credit" for Credit Mode (enables installments, budgets, statements), "simple" for Simple Mode (basic tracking)'
        },
        payment_method_name: {
          type: 'string',
          description: 'Optional: Name of the credit card to switch (e.g., "Nubank", "C6"). If not provided, will prompt user to select if they have multiple cards.'
        }
      },
      required: ['target_mode']
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
      model: 'gpt-5',
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
        DELETE_BUDGET_TOOL,
        // Epic 1: Credit Mode
        CREDIT_MODE_SWITCH_TOOL,
        // Epic 2: Installments
        INSTALLMENT_TOOL,
        FUTURE_COMMITMENTS_TOOL,
        PAYOFF_INSTALLMENT_TOOL,
        DELETE_INSTALLMENT_TOOL,
        // Epic 3: Statement Summary
        STATEMENT_SUMMARY_TOOL
      ],
      tool_choice: 'auto',
      temperature: 0.1,
      max_tokens: 1500  // Increased for OCR scenarios with multiple transactions
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
      
      // DEBUG: Log the raw function call for OCR debugging
      console.log('AI function call:', JSON.stringify({
        function: functionName,
        arguments: args
      }, null, 2))
      
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
 * Parse OCR text with AI using specialized OCR prompt
 * Optimized for extracting transactions from images (receipts, bank statements, credit card SMS)
 */
export async function parseOCRWithAI(
  ocrText: string,
  context: UserContext
): Promise<ParsedIntent> {
  // Check daily limit before making API call
  const limitCheck = await checkDailyLimit(context.userId)
  if (!limitCheck.allowed) {
    logger.warn('Daily AI limit exceeded for OCR', { userId: context.userId })
    throw new Error('Daily AI usage limit exceeded')
  }

  const systemPrompt = createOCRSystemPrompt(context)

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: ocrText }
  ]

  try {
    // Count amounts in OCR text for validation
    const amountMatches = ocrText.match(/(?:R\$|RS|reais)\s*[\d.,]+/gi)
    const expectedTransactionCount = amountMatches?.length || 0

    logger.info('OCR AI parsing started', {
      userId: context.userId,
      ocrTextLength: ocrText.length,
      expectedTransactionCount
    })

    const completion = await openai.chat.completions.create({
      model: 'gpt-5',
      messages,
      tools: [
        EXPENSE_TOOL,  // Only need expense tool for OCR extraction
      ],
      tool_choice: 'auto',
      temperature: 0.1,  // Low temperature for accuracy
      max_tokens: 2000   // Higher limit for multi-transaction OCR
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

      // Validation: Check if AI extracted expected number of transactions
      const extractedCount = args.transactions?.length || (args.amount ? 1 : 0)

      if (expectedTransactionCount > 0 && extractedCount < expectedTransactionCount) {
        logger.warn('OCR extraction mismatch', {
          userId: context.userId,
          expectedCount: expectedTransactionCount,
          extractedCount,
          amounts: amountMatches
        })
      }

      logger.info('OCR AI parsing completed', {
        userId: context.userId,
        function: functionName,
        extractedCount,
        expectedCount: expectedTransactionCount
      })

      return convertFunctionCallToIntent(functionName, args)
    }

    // No function called - return unknown
    logger.warn('OCR AI did not call any function', {
      userId: context.userId,
      ocrTextPreview: ocrText.substring(0, 200)
    })

    return {
      action: 'unknown',
      confidence: 0.3,
      entities: {}
    }
  } catch (error) {
    logger.error('Error in parseOCRWithAI', { userId: context.userId }, error as Error)
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
        // Default to 'add_expense' if action is missing
        const action = args.action || 'add_expense'
        intent = {
          action: action,
          confidence: 0.95,
          entities: {
            amount: args.amount,
            category: args.category,
            description: args.description || args.category,
            date: args.date,
            paymentMethod: args.payment_method,
            type: action === 'add_income' ? 'income' : 'expense'
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
          description: args.period,
          is_default: args.is_default
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
          paymentMethod: args.payment_method,
          type: args.type
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
          year: args.year,
          is_default: args.is_default
        }
      }
      break

    // Epic 2 Story 2.1: Installment creation
    case 'create_installment':
      intent = {
        action: 'create_installment',
        confidence: 0.95,
        entities: {
          amount: args.amount,
          installments: args.installments,
          description: args.description,
          merchant: args.merchant,
          firstPaymentDate: args.first_payment_date
        }
      }
      break

    // Epic 2 Story 2.3: View future commitments
    case 'view_future_commitments':
      intent = {
        action: 'view_future_commitments',
        confidence: 0.95,
        entities: {}
      }
      break

    // Epic 2 Story 2.5: Pay off installment early
    case 'payoff_installment':
      intent = {
        action: 'payoff_installment',
        confidence: 0.95,
        entities: {
          description: args.description
        }
      }
      break

    // Epic 3 Story 3.5: View statement summary
    case 'view_statement_summary':
      intent = {
        action: 'view_statement_summary',
        confidence: 0.95,
        entities: {}
      }
      break

    // Epic 1 Story 1.5: Credit Mode Switch
    case 'switch_credit_mode':
      intent = {
        action: 'switch_credit_mode',
        confidence: 0.95,
        entities: {
          targetMode: args.target_mode,
          paymentMethodName: args.payment_method_name
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
2. For dates: "hoje" = today, "ontem" = yesterday, "DD/MM" or "DD/MM/YYYY" = specific date, "X de [mês]" = Xth of current month/year
3. For amounts: accept "50", "R$ 50", "50 reais", convert to number
4. **CRITICAL - MULTIPLE TRANSACTIONS**: Before responding, COUNT how many "R$" amounts appear in the message. If you count 2 or more amounts, you MUST use the transactions array and include ALL of them. DO NOT return just one transaction when multiple exist.
5. **OCR/BANK STATEMENTS**: Messages with pattern "MERCHANT R$ XX,XX\ndate\nMERCHANT R$ XX,XX\ndate" repeated = bank statement with MULTIPLE transactions. You MUST extract EVERY SINGLE transaction into the transactions array.
6. **VERIFICATION**: After extracting transactions, verify your count matches the number of R$ amounts in the original message.
7. Default to "add_expense" unless income is explicitly mentioned (recebi, ganhei, salário, etc.)
8. If uncertain, make best guess based on context
9. When user replies to previous message (context provided), consider both messages together
10. **TRANSACTION REPLIES**: If message contains [transaction_id: ABC123], extract the ID and use it for edit/delete/change operations
11. **CATEGORY CHANGES**: "mudar categoria", "alterar categoria", "trocar categoria" = change_category (NOT list_items!)
12. **CATEGORY MATCHING - ENHANCED**:
    - ALWAYS prioritize user's custom categories (listed FIRST in AVAILABLE CATEGORIES) over default categories
    - Match categories by semantic meaning, not just keywords (e.g., "supermercado", "mercado", "compras no mercado" all → "Food & Dining" or custom "Comida")
    - For merchant names, infer category (e.g., "IFOOD" → food, "UBER" → transport, "NETFLIX" → entertainment)
    - Handle typos and variations (e.g., "comda" → "comida", "saude" or "saúde" → same category)
    - For ambiguous cases, use transaction amount as hint (e.g., R$ 5 might be transport/snack, R$ 5000 likely rent/income)
    - If description contains merchant name (e.g., "MINIMERCADO PAQUISTAO"), extract clean merchant name for description field
13. **PORTUGUESE NORMALIZATION**: Treat accented and non-accented characters as equivalent (e.g., "saúde" = "saude", "café" = "cafe")

CATEGORY MATCHING EXAMPLES:
- "gastei no mercado" / "supermercado" / "compras mercado" → "Food & Dining" (or user's custom "Comida" if it exists)
- "saude" / "saúde" / "farmácia" / "farmacia" → "Healthcare" (or custom "Saúde")
- "comda" (typo) → "Food & Dining" (fuzzy match to "comida")
- "MINIMERCADO PAQUISTAO" → category="Food & Dining", description="MINIMERCADO PAQUISTAO"
- "UBER" / "uber" / "99" → "Transportation"
- "NETFLIX" / "Spotify" → "Entertainment"
- "posto de gasolina" → "Transportation"

MESSAGE PARSING EXAMPLES:
"gastei 50 em comida" → add_expense_or_income(action="add_expense", amount=50, category="comida")
"paguei 30 de uber com cartão" → add_expense_or_income(action="add_expense", amount=30, category="transporte", description="uber", payment_method="cartão")
"comprei 25 no mercado e 15 na farmácia" → add_expense_or_income(action="add_expense", transactions=[{amount:25, category:"comida"}, {amount:15, category:"saúde"}])
"SUPERMERCADO R$ 50,00\n6 de novembro\nFARMACIA R$ 30,00\n5 de novembro\nPOSTO R$ 200,00\n4 de novembro" → add_expense_or_income(action="add_expense", transactions=[{amount:50, category:"comida", description:"SUPERMERCADO", date:"2025-11-06"}, {amount:30, category:"saúde", description:"FARMACIA", date:"2025-11-05"}, {amount:200, category:"transporte", description:"POSTO", date:"2025-11-04"}])
"recebi 5000 de salário" → add_expense_or_income(action="add_income", amount=5000, category="salário")
"listar gastos" → list_items(type="transactions")
"listar categorias" → list_items(type="categories")
"relatório do mês" → show_report(period="this month")
"mudar categoria para outros [transaction_id: ABC123]" → change_category(transaction_id="ABC123", new_category="outros")
"alterar para mercado [transaction_id: XYZ789]" → change_category(transaction_id="XYZ789", new_category="mercado")

TYPE CONVERSION EXAMPLES (Portuguese):
"EXP-123 era receita" → edit_transaction(transaction_id="EXP-123", type="income")
"transação 456 deveria ser despesa" → edit_transaction(transaction_id="456", type="expense")
"mudar EXP-789 para receita" → edit_transaction(transaction_id="EXP-789", type="income")
"corrigir ABC-456 para despesa" → edit_transaction(transaction_id="ABC-456", type="expense")
"EXP-321 era receita de 500" → edit_transaction(transaction_id="EXP-321", type="income", amount=500)

TYPE CONVERSION EXAMPLES (English):
"transaction 789 should be income" → edit_transaction(transaction_id="789", type="income")
"EXP-456 was expense" → edit_transaction(transaction_id="EXP-456", type="expense")
"change ABC-123 to income" → edit_transaction(transaction_id="ABC-123", type="income")
"correct XYZ-789 to expense" → edit_transaction(transaction_id="XYZ-789", type="expense")
"EXP-999 should be income of 750" → edit_transaction(transaction_id="EXP-999", type="income", amount=750)

INSTALLMENT PATTERNS (Portuguese):
"gastei 600 em 3x no celular" → create_installment(amount=600, installments=3, description="celular")
"comprei 450 em 9x" → create_installment(amount=450, installments=9)
"800 parcelado 4x no notebook" → create_installment(amount=800, installments=4, description="notebook")
"900 dividido em 6 parcelas para tablet" → create_installment(amount=900, installments=6, description="tablet")
"1200 em 12 vezes sem juros" → create_installment(amount=1200, installments=12)
"gastei 600 em 3x, primeira parcela dia 15" → create_installment(amount=600, installments=3, first_payment_date="2025-XX-15")

INSTALLMENT PATTERNS (English):
"spent 600 in 3 installments on phone" → create_installment(amount=600, installments=3, description="phone")
"bought 450 in 9x" → create_installment(amount=450, installments=9)

PAYOFF INSTALLMENT PATTERNS (Portuguese):
"quitar parcelamento do celular" → payoff_installment(description="celular")
"pagar resto do notebook" → payoff_installment(description="notebook")
"quitação antecipada" → payoff_installment()
"quitar parcelamento" → payoff_installment()
"quitar parcelas" → payoff_installment()

PAYOFF INSTALLMENT PATTERNS (English):
"pay off phone installment" → payoff_installment(description="phone")
"pay off early" → payoff_installment()
"settle remaining installments" → payoff_installment()

Call the most appropriate function based on the user's intent.`
}

/**
 * Create OCR-optimized system prompt for extracting transactions from images
 * Optimized for: receipts, bank statements, credit card SMS
 */
function createOCRSystemPrompt(context: UserContext): string {
  const today = new Date().toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  return `CATEGORIAS DISPONÍVEIS (categorias customizadas primeiro): ${context.recentCategories.join(', ')}
DATA DE HOJE: ${today}

Você é um especialista em extração de dados financeiros via OCR no contexto brasileiro.

**TAREFA CRÍTICA**: Analise o texto OCR e extraia **TODAS** as transações (receitas E despesas).

⚠️ IMPORTANTE: Extratos bancários têm MÚLTIPLOS tipos de transação no mesmo documento:
- Use o campo "type" em CADA transação para diferenciar receitas de despesas
- NÃO escolha apenas um tipo - extraia TUDO
- Sempre use action="add_expense" com o array transactions contendo o campo "type" correto

📋 DIREÇÃO DAS TRANSAÇÕES:
**RECEITAS (type: "income")**:
- Pix recebido
- Recebimento
- Crédito
- Entrada
- Depósito
- Rendimentos / Rendimento / Rend

**DESPESAS (type: "expense")**:
- Pix enviado
- Pagamento de boleto
- Débito
- Saída
- Compra aprovada
- Transação com sinal negativo (- R$)

🔍 TIPOS DE DOCUMENTOS:

1. **Extrato bancário** (o mais comum):
   - Contém MÚLTIPLAS transações de tipos DIFERENTES
   - Exemplo: "Pix recebido R$ 200" (income) + "Pix enviado R$ 47" (expense)
   - SEMPRE preencha o campo "type" corretamente para cada linha

2. **SMS de cartão de crédito**:
   - "Compra aprovada no MERCHANT valor R$ X"
   - Sempre expense, payment_method="Credit Card"

3. **Fatura de cartão**:
   - Lista de compras com datas
   - Sempre expense

✅ REGRAS DE EXTRAÇÃO:

1. **CONTE PRIMEIRO**: Quantos "R$" aparecem? Sua resposta DEVE ter esse mesmo número de transações
2. **TYPE É OBRIGATÓRIO**: TODA transação DEVE ter o campo "type": "income" ou "expense"
   - "Pix recebido", "Rendimentos", "Transferência recebida" → type: "income"
   - "Pix enviado", "Pagamento", "Compra" → type: "expense"
3. **CORRIJA OCR**: "R S" → "R$", "8 ,50" → 8.50, "MINIMERCAD O" → "MINIMERCADO"
4. **IGNORE SALDOS**: "Saldo do dia: R$ X" NÃO é uma transação, pule
5. **NORMALIZE VALORES**: Remova sinais negativos do amount, use apenas o campo "type"
6. **ASSOCIE MULTI-LINHA**: Em extratos, dados estão em linhas separadas:
   Exemplo: "Pix recebido" + "Douglas Adriano" + "R$ 200,00" = 1 transação com type: "income"

🧠 MAPEAMENTO DE CATEGORIAS:

- **Educação**: escola, educacao, infantil, tom e jerry
- **Investimento**: rendimento, rendimentos, rend, aplicacao, cdi
- **Transferência**: pix recebido, douglas, catia, transferencia
- **Contas e Utilidades**: pagamento de boleto, banco, pan, inter, boleto
- **Alimentação**: supermercado, mercado, minimercado, paquistao
- **Saúde**: farmacia, panvel, drogaria
- **Transporte**: posto, uber, 99, combustível
- **Outros**: quando nenhuma se aplicar

📚 EXEMPLOS DE RESPOSTAS CORRETAS:

**Exemplo 1 - Receita única (Pix recebido):**
Input OCR: "Pix recebido\\nJoao Silva\\nR$ 150,00"

Resposta CORRETA:
{
  "name": "add_expense_or_income",
  "arguments": {
    "action": "add_expense",
    "transactions": [
      {
        "amount": 150.00,
        "type": "income",
        "category": "Transferência",
        "description": "Joao Silva",
        "payment_method": "Pix"
      }
    ]
  }
}

**Exemplo 2 - Despesa única (Compra):**
Input OCR: "Pix enviado\\nSupermercado ABC\\nR$ 85,50"

Resposta CORRETA:
{
  "name": "add_expense_or_income",
  "arguments": {
    "action": "add_expense",
    "transactions": [
      {
        "amount": 85.50,
        "type": "expense",
        "category": "Alimentação",
        "description": "Supermercado ABC",
        "payment_method": "Pix"
      }
    ]
  }
}

**Exemplo 3 - DOCUMENTO MISTO com receitas E despesas:**
Input OCR: "Pix recebido R$ 200\\nPix enviado R$ 50\\nRendimentos R$ 1,20"

Resposta CORRETA (note os diferentes types):
{
  "name": "add_expense_or_income",
  "arguments": {
    "action": "add_expense",
    "transactions": [
      {
        "amount": 200.00,
        "type": "income",
        "category": "Transferência",
        "description": "Pix recebido",
        "payment_method": "Pix"
      },
      {
        "amount": 50.00,
        "type": "expense",
        "category": "Outros",
        "description": "Pix enviado",
        "payment_method": "Pix"
      },
      {
        "amount": 1.20,
        "type": "income",
        "category": "Investimento",
        "description": "Rendimentos",
        "payment_method": "Investimento"
      }
    ]
  }
}

⚠️ ERRO COMUM: NÃO faça isso:
❌ Usar apenas um tipo para documento misto
❌ Omitir o campo "type"
❌ Escolher só receitas OU só despesas quando há ambas

📦 EXEMPLO COMPLETO (BASEADO EM EXTRATO REAL):

Input:
\`\`\`
12 de novembro de 2025
Saldo do dia: R$ 2.285,73
Rendimentos
Rend Pago Aplic
R$ 0,05
Pix recebido
Douglas Adriano Venturella Pereira
R$ 200,00
Pix enviado
Escola De Educacao Infantil Tom E Jerry
- R$ 47,00
Pix enviado
Escola De Educacao Infantil Tom E Jerry
- R$ 30,00
Pix recebido
Catia Terezinha Ligocki Venturella
R$ 198,00
Pagamento de boleto
Banco Pan Sa
- R$ 19,80
\`\`\`

Output:
\`\`\`json
add_expense_or_income(action="add_expense", transactions=[
  {
    "amount": 0.05,
    "description": "Rendimentos Aplicação",
    "category": "Investimento",
    "date": "2025-11-12",
    "type": "income",
    "payment_method": "Investimento"
  },
  {
    "amount": 200.00,
    "description": "Douglas Adriano Venturella Pereira",
    "category": "Transferência",
    "date": "2025-11-12",
    "type": "income",
    "payment_method": "Pix"
  },
  {
    "amount": 47.00,
    "description": "Escola De Educacao Infantil Tom E Jerry",
    "category": "Educação",
    "date": "2025-11-12",
    "type": "expense",
    "payment_method": "Pix"
  },
  {
    "amount": 30.00,
    "description": "Escola De Educacao Infantil Tom E Jerry",
    "category": "Educação",
    "date": "2025-11-12",
    "type": "expense",
    "payment_method": "Pix"
  },
  {
    "amount": 198.00,
    "description": "Catia Terezinha Ligocki Venturella",
    "category": "Transferência",
    "date": "2025-11-12",
    "type": "income",
    "payment_method": "Pix"
  },
  {
    "amount": 19.80,
    "description": "Banco Pan",
    "category": "Contas e Utilidades",
    "date": "2025-11-12",
    "type": "expense",
    "payment_method": "Boleto"
  }
])
\`\`\`

⚠️ VERIFICAÇÃO FINAL:
- Contei 7 valores R$ no input (excluindo "Saldo do dia")
- Retornei 6 transações (R$ 0,05 + R$ 200 + R$ 47 + R$ 30 + R$ 198 + R$ 19,80)
- Total: 6 transações ✓
- SEMPRE valide sua contagem antes de responder!`
}

/**
 * Get user context for AI parsing
 */
export async function getUserContext(userId: string): Promise<UserContext> {
  const supabase = getSupabaseClient()
  
  // Fetch actual category names from categories table with types
  const { data: allCategories } = await supabase
    .from('categories')
    .select('name, type, is_custom, user_id')
    .or(`user_id.eq.${userId},is_custom.eq.false`)
    .order('is_custom', { ascending: false }) // Custom categories first
    .order('name', { ascending: true })

  // Custom categories first, then default ones
  const customCategories = allCategories?.filter(c => c.is_custom && c.user_id === userId).map(c => c.name) || []
  const defaultCategories = allCategories?.filter(c => !c.is_custom).map(c => c.name) || []
  const recentCategories = [...customCategories, ...defaultCategories]

  // Create category type map for inferring transaction types
  const categoryTypeMap = new Map<string, 'income' | 'expense'>()
  allCategories?.forEach(cat => {
    categoryTypeMap.set(cat.name.toLowerCase(), cat.type as 'income' | 'expense')
  })
  
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
    userPreferences: preferences || [],
    categoryTypeMap
  }
}

