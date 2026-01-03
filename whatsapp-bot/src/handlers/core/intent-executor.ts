/**
 * Intent Executor
 * Routes parsed intents to appropriate domain handlers
 */

import { getUserSession } from '../../auth/session-manager.js'
import { handleLogin, handleLogout } from '../auth/auth.js'
import { handleAddExpense, handleShowExpenses } from '../transactions/expenses.js'
import { handleSetBudget, handleShowBudgets, handleDeleteBudget } from '../budgets/budgets.js'
import { handleAddRecurring, handleShowRecurring, handleDeleteRecurring, handleEditRecurring, handleMakeExpenseRecurring } from '../recurring/recurring.js'
import { handleShowReport } from '../reports/reports.js'
import { handleListCategories, handleAddCategory, handleRemoveCategory } from '../categories/categories.js'
import { handleEditTransaction, handleDeleteTransaction, handleChangeCategory, handleShowTransactionDetails } from '../transactions/transactions.js'
import { handleSearchTransactions, handleQuickStats } from '../search/search.js'
import { handleAnalyzeSpending } from '../reports/analysis.js'
import { handleUndo } from './undo.js'
import { handleCreateInstallment } from '../credit-card/installment-handler.js'
import { handleFutureCommitments } from '../credit-card/future-commitments-handler.js'
import { handlePayoffRequest } from '../credit-card/installment-payoff-handler.js'
import { handleDeleteRequest } from '../credit-card/installment-delete-handler.js'
import { handleStatementSummaryRequest } from '../credit-card/statement-summary-handler.js'
import { handleModeSwitchRequest } from '../credit-card/mode-switch.js'
import { messages } from '../../localization/pt-br.js'
import { getSuggestedPaymentMethod, updatePaymentMethodPreference } from '../../nlp/pattern-storage.js'
import { logger } from '../../services/monitoring/logger.js'
import { getCategoryId } from './helpers.js'
import { getCommandHelp } from '../../nlp/intent-parser.js'

// Execution result for tracking
export interface ExecutionResult {
  message: string | string[]
  transactionIds?: string[]  // For linking to transactions table
  success: boolean
  errorDetails?: string
}

/**
 * Execute a parsed intent
 * @param parsingMetricId - ID from parsing_metrics table for transaction linking
 * @param wasNlpParsed - True if intent was parsed via NLP (semantic cache or LLM), false for explicit commands
 */
export async function executeIntent(
  whatsappNumber: string,
  intent: any,
  session?: any,
  parsingMetricId?: string | null,
  wasNlpParsed?: boolean
): Promise<string | string[]> {
  const startTime = Date.now()

  logger.info('Executing intent', {
    whatsappNumber,
    userId: session?.userId,
    action: intent.action,
    parsingMetricId
  })
  
  try {
    // Handle multiple transactions
    if (intent.entities.transactions && intent.entities.transactions.length > 1) {
      const result = await handleMultipleTransactions(whatsappNumber, intent.entities.transactions, parsingMetricId, wasNlpParsed)
      logger.info('Multiple transactions executed', {
        whatsappNumber,
        count: intent.entities.transactions.length,
        duration: Date.now() - startTime
      })
      return result
    }
    
    // Add payment method suggestion if not provided
    if (intent.action === 'add_expense' && intent.entities.category && !intent.entities.paymentMethod) {
      const currentSession = session || await getUserSession(whatsappNumber)
      if (currentSession) {
        try {
          const categoryId = await getCategoryId(intent.entities.category, currentSession.userId)
          
          if (categoryId) {
            const suggestedPaymentMethod = await getSuggestedPaymentMethod(currentSession.userId, categoryId)
            if (suggestedPaymentMethod) {
              intent.entities.paymentMethod = suggestedPaymentMethod
              logger.debug('Payment method suggested', {
                whatsappNumber,
                category: intent.entities.category,
                paymentMethod: suggestedPaymentMethod
              })
            }
          }
        } catch (error) {
          logger.error('Error getting payment method suggestion', { whatsappNumber }, error as Error)
          // Continue without payment method suggestion
        }
      }
    }

    let result: string | string[]

    // Route to appropriate handler
    switch (intent.action) {
      case 'logout':
        result = await handleLogout(whatsappNumber)
        break

      case 'add_expense':
      case 'add_income':
        result = await handleAddExpense(whatsappNumber, intent, parsingMetricId, wasNlpParsed)

        // Learn payment method preference
        if (intent.entities.category && intent.entities.paymentMethod) {
          const currentSession = session || await getUserSession(whatsappNumber)
          if (currentSession) {
            try {
              const categoryId = await getCategoryId(intent.entities.category, currentSession.userId)
              
              if (categoryId) {
                await updatePaymentMethodPreference(
                  currentSession.userId, 
                  categoryId, 
                  intent.entities.paymentMethod
                )
                logger.debug('Payment method preference learned', {
                  whatsappNumber,
                  category: intent.entities.category,
                  paymentMethod: intent.entities.paymentMethod
                })
              }
            } catch (error) {
              logger.error('Error learning payment method preference', { whatsappNumber }, error as Error)
              // Continue without learning the preference
            }
          }
        }
        break

      case 'show_expenses':
        result = await handleShowExpenses(whatsappNumber)
        break

      case 'set_budget':
        result = await handleSetBudget(whatsappNumber, intent)
        break

      case 'show_budget':
        result = await handleShowBudgets(whatsappNumber)
        break

      case 'add_recurring':
        result = await handleAddRecurring(whatsappNumber, intent)
        break

      case 'show_recurring':
        result = await handleShowRecurring(whatsappNumber)
        break

      case 'delete_recurring':
        result = await handleDeleteRecurring(whatsappNumber)
        break

      case 'show_report':
        result = await handleShowReport(whatsappNumber, intent)
        break

      case 'list_categories':
        result = await handleListCategories(whatsappNumber)
        break

      case 'add_category':
        result = await handleAddCategory(whatsappNumber, intent)
        break

      case 'list_transactions':
        result = await handleShowExpenses(whatsappNumber)
        break

      case 'list_recurring':
        result = await handleShowRecurring(whatsappNumber)
        break

      case 'list_budgets':
        result = await handleShowBudgets(whatsappNumber)
        break

      case 'show_help':
      case 'help':
        result = await getCommandHelp(intent.entities.description)
        break

      // NEW: Transaction Management
      case 'edit_transaction':
        result = await handleEditTransaction(whatsappNumber, intent)
        break

      case 'delete_transaction':
        result = await handleDeleteTransaction(whatsappNumber, intent.entities.transactionId!)
        break

      case 'change_category':
        result = await handleChangeCategory(
          whatsappNumber,
          intent.entities.transactionId!,
          intent.entities.category!
        )
        break

      case 'show_transaction_details':
        result = await handleShowTransactionDetails(whatsappNumber, intent.entities.transactionId!)
        break

      // NEW: Category Management
      case 'remove_category':
        result = await handleRemoveCategory(whatsappNumber, intent.entities.category!)
        break

      // NEW: Recurring Management
      case 'edit_recurring':
        result = await handleEditRecurring(whatsappNumber, intent)
        break

      case 'make_expense_recurring':
        result = await handleMakeExpenseRecurring(
          whatsappNumber,
          intent.entities.transactionId!,
          intent.entities.dayOfMonth!
        )
        break

      // NEW: Budget Management
      case 'delete_budget':
        result = await handleDeleteBudget(whatsappNumber, intent)
        break

      // NEW: Search & Analysis
      case 'search_transactions':
        result = await handleSearchTransactions(whatsappNumber, intent.entities.searchCriteria!)
        break

      case 'quick_stats':
        result = await handleQuickStats(whatsappNumber, intent.entities.period!)
        break

      case 'analyze_spending':
        result = await handleAnalyzeSpending(whatsappNumber, intent.entities.analysisType!)
        break

      // NEW: Undo
      case 'undo_last':
        result = await handleUndo(whatsappNumber)
        break

      // Epic 2 Story 2.1: Installments
      case 'create_installment':
        result = await handleCreateInstallment(whatsappNumber, intent)
        break

      // Epic 2 Story 2.3: Future Commitments
      case 'view_future_commitments':
        result = await handleFutureCommitments(whatsappNumber)
        break

      // Epic 2 Story 2.5: Pay Off Installment Early
      case 'payoff_installment':
        result = await handlePayoffRequest(whatsappNumber, intent.entities.description || '')
        break

      // Epic 2 Story 2.7: Delete Installment Plan
      case 'delete_installment':
        result = await handleDeleteRequest(whatsappNumber, intent.entities.description || '')
        break

      // Epic 3 Story 3.5: View Statement Summary
      case 'view_statement_summary':
        result = await handleStatementSummaryRequest(whatsappNumber)
        break

      // Epic 1 Story 1.5: Credit Mode Switch
      case 'switch_credit_mode':
        result = await handleModeSwitchRequest(whatsappNumber, intent)
        break

      default:
        result = messages.unknownCommand
    }
    
    logger.info('Intent executed successfully', {
      whatsappNumber,
      action: intent.action,
      duration: Date.now() - startTime
    })
    
    return result
  } catch (error) {
    logger.error('Error executing intent', {
      whatsappNumber,
      action: intent.action,
      duration: Date.now() - startTime
    }, error as Error)
    throw error
  }
}

/**
 * Handle multiple transactions in a single message
 * Returns an array of messages to send individually
 * @param parsingMetricId - ID from parsing_metrics table for transaction linking
 * @param wasNlpParsed - True if intent was parsed via NLP (semantic cache or LLM)
 */
export async function handleMultipleTransactions(
  whatsappNumber: string,
  transactions: any[],
  parsingMetricId?: string | null,
  wasNlpParsed?: boolean
): Promise<string[]> {
  const messageList: string[] = []
  let successCount = 0

  logger.info('Processing multiple transactions', {
    whatsappNumber,
    count: transactions.length,
    parsingMetricId
  })

  // Send initial message about processing multiple transactions
  messageList.push(`📋 Processando ${transactions.length} transações...`)

  for (let i = 0; i < transactions.length; i++) {
    const transaction = transactions[i]
    try {
      const intent = {
        action: 'add_expense' as const,
        confidence: 0.9,
        entities: transaction
      }

      const result = await handleAddExpense(whatsappNumber, intent, parsingMetricId, wasNlpParsed)
      messageList.push(`${i + 1}/${transactions.length} - ${result}`)
      successCount++
    } catch (error) {
      logger.error('Error processing transaction in batch', {
        whatsappNumber,
        index: i,
        description: transaction.description
      }, error as Error)
      messageList.push(`${i + 1}/${transactions.length} - ❌ Erro ao processar: ${transaction.description || 'transação'}`)
    }
  }
  
  // Send summary message
  messageList.push(`\n✅ Concluído! ${successCount}/${transactions.length} transações processadas com sucesso.`)
  
  logger.info('Multiple transactions completed', {
    whatsappNumber,
    total: transactions.length,
    successful: successCount
  })
  
  return messageList
}
