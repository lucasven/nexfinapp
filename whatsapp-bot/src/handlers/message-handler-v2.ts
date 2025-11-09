/**
 * Message Handler V2
 * Simplified 3-layer architecture: Explicit Commands → Cache → LLM
 */

import { MessageContext } from '../types'
import { parseIntent, getCommandHelp } from '../nlp/intent-parser'
import { getUserSession, updateUserActivity, createUserSession } from '../auth/session-manager'
import { handleLogin, handleLogout } from './auth'
import { handleAddExpense, handleShowExpenses } from './expenses'
import { handleSetBudget, handleShowBudgets, handleDeleteBudget } from './budgets'
import { handleAddRecurring, handleShowRecurring, handleDeleteRecurring, handleEditRecurring, handleMakeExpenseRecurring } from './recurring'
import { handleShowReport } from './reports'
import { handleListCategories, handleAddCategory, handleRemoveCategory } from './categories'
import { handleEditTransaction, handleDeleteTransaction, handleChangeCategory, handleShowTransactionDetails } from './transactions'
import { handleSearchTransactions, handleQuickStats } from './search'
import { handleAnalyzeSpending } from './analysis'
import { handleUndo } from './undo'
import { extractExpenseFromImage } from '../ocr/image-processor'
import { messages } from '../localization/pt-br'
import { getSuggestedPaymentMethod, updatePaymentMethodPreference } from '../nlp/pattern-storage'
import { getSupabaseClient } from '../services/supabase-client'
import { hasPendingTransaction, handleDuplicateConfirmation } from './duplicate-confirmation'
import { handleTransactionCorrection } from './transaction-corrections'
import { checkAuthorization, hasPermission } from '../middleware/authorization'
import { logger } from '../services/logger'
import { recordParsingMetric, ParsingStrategy } from '../services/metrics-tracker'
import { parseWithAI, getUserContext } from '../nlp/ai-pattern-generator-v2'
import { checkCache, saveToCache } from '../services/semantic-cache'
import { checkDailyLimit } from '../services/ai-usage-tracker'
import { isTransactionReply, extractTransactionIdFromQuote, injectTransactionIdContext } from '../services/transaction-id-extractor'

// Feature flag for showing parsing strategy feedback to users
const SHOW_PARSING_FEEDBACK = false

/**
 * Helper function to get category ID from category name
 */
async function getCategoryId(categoryName: string): Promise<string | null> {
  try {
    const supabase = getSupabaseClient()
    const { data: categoryData } = await supabase
      .from('categories')
      .select('id')
      .ilike('name', `%${categoryName}%`)
      .limit(1)
      .single()
    
    return categoryData?.id || null
  } catch (error) {
    logger.error('Error looking up category ID', { categoryName }, error as Error)
    return null
  }
}

/**
 * Helper function to auto-authenticate using authorized WhatsApp numbers
 * Returns existing session or creates one if the number is authorized
 */
async function getOrCreateSession(whatsappNumber: string): Promise<any | null> {
  // Check for existing session first
  let session = await getUserSession(whatsappNumber)
  if (session) {
    return session
  }

  // Try auto-authentication via authorized_whatsapp_numbers
  const authResult = await checkAuthorization(whatsappNumber)
  if (authResult.authorized && authResult.userId) {
    logger.info('Auto-authenticating WhatsApp number', { whatsappNumber, userId: authResult.userId })
    await createUserSession(whatsappNumber, authResult.userId)
    session = await getUserSession(whatsappNumber)
    return session
  }

  return null
}

export async function handleMessage(context: MessageContext): Promise<string | string[] | null> {
  const { from, isGroup, message, hasImage, imageBuffer, quotedMessage } = context

  logger.info('Message received', {
    from,
    isGroup,
    hasImage,
    hasQuote: !!quotedMessage,
    messageLength: message?.length || 0
  })

  // Handle group messages - only respond if mentioned or starts with "bot"
  if (isGroup) {
    const shouldRespond = message?.toLowerCase().includes('bot') || 
                         message?.toLowerCase().includes('@bot')
    
    if (!shouldRespond && !hasImage) {
      logger.debug('Ignoring group message without bot mention', { from })
      return null // Ignore group messages that don't mention the bot
    }

    if (shouldRespond && !message) {
      return messages.groupMention
    }
  }

  // Handle image messages
  if (hasImage && imageBuffer) {
    return await handleImageMessage(from, imageBuffer, message)
  }

  // Handle text messages
  if (!message || message.trim() === '') {
    return null
  }

  return await handleTextMessage(from, message, quotedMessage)
}

async function handleTextMessage(
  whatsappNumber: string,
  message: string,
  quotedMessage?: string
): Promise<string | string[]> {
  const startTime = Date.now()
  let strategy: ParsingStrategy = 'unknown'
  let session: any = null
  
  try {
    // LAYER 0: State checks (correction, duplicate confirmation)
    if (hasPendingTransaction(whatsappNumber)) {
      strategy = 'duplicate_confirmation'
      logger.info('Using duplicate confirmation strategy', { whatsappNumber })
      const result = await handleDuplicateConfirmation(whatsappNumber, message)
      
      await recordParsingMetric({
        whatsappNumber,
        messageText: message,
        messageType: 'text',
        strategyUsed: strategy,
        success: true,
        parseDurationMs: Date.now() - startTime
      })
      
      return result
    }

    // LAYER 0.5: Reply Context Extraction
    // If user is replying to a bot message with a transaction ID, inject it as context for the LLM
    let enhancedMessage = message
    if (quotedMessage && isTransactionReply(quotedMessage)) {
      const transactionId = extractTransactionIdFromQuote(quotedMessage)
      
      if (transactionId) {
        enhancedMessage = injectTransactionIdContext(message, transactionId)
        logger.info('Reply context detected', {
          whatsappNumber,
          transactionId,
          originalMessage: message
        })
      }
    }

    // LAYER 1: Explicit Commands (fast path, zero cost)
    if (message.trim().startsWith('/')) {
      strategy = 'explicit_command'
      const commandResult = parseIntent(message)
      
      if (commandResult.action !== 'unknown' && commandResult.confidence >= 0.9) {
        logger.info('Explicit command detected', {
          whatsappNumber,
          action: commandResult.action,
          confidence: commandResult.confidence
        })
        
        // Handle login and help without authentication
        if (commandResult.action === 'login') {
          const result = await handleLogin(whatsappNumber, commandResult.entities.description || '')
          
          await recordParsingMetric({
            whatsappNumber,
            messageText: message,
            messageType: 'text',
            strategyUsed: strategy,
            intentAction: commandResult.action,
            confidence: commandResult.confidence,
            success: true,
            parseDurationMs: Date.now() - startTime
          })
          
          return result
        }
        
        if (commandResult.action === 'help') {
          const result = commandResult.entities.description 
            ? getCommandHelp(commandResult.entities.description) 
            : messages.welcome
          
          await recordParsingMetric({
            whatsappNumber,
            messageText: message,
            messageType: 'text',
            strategyUsed: strategy,
            intentAction: commandResult.action,
            confidence: commandResult.confidence,
            success: true,
            parseDurationMs: Date.now() - startTime
          })
          
          return result
        }
        
        // Check authentication for other commands
        session = await getOrCreateSession(whatsappNumber)
        if (!session) {
          await recordParsingMetric({
            whatsappNumber,
            messageText: message,
            messageType: 'text',
            strategyUsed: strategy,
            intentAction: commandResult.action,
            confidence: commandResult.confidence,
            success: false,
            errorMessage: 'Authentication required'
          })
          return messages.loginPrompt
        }
        
        await updateUserActivity(whatsappNumber)
        
        // Check permissions
        const requiredPermission = ACTION_PERMISSION_MAP[commandResult.action]
        if (requiredPermission) {
          const authResult = await checkAuthorization(whatsappNumber)
          
          if (!authResult.authorized || !hasPermission(authResult.permissions, requiredPermission)) {
            const actionDesc = getActionDescription(commandResult.action)
            logger.warn('Permission denied', {
              whatsappNumber,
              action: commandResult.action,
              required: requiredPermission
            })
            
            await recordParsingMetric({
              whatsappNumber,
              messageText: message,
              messageType: 'text',
              strategyUsed: strategy,
              intentAction: commandResult.action,
              confidence: commandResult.confidence,
              success: false,
              permissionRequired: requiredPermission,
              permissionGranted: false,
              errorMessage: 'Permission denied'
            })
            
            return messages.permissionDenied(actionDesc)
          }
        }
        
        const result = await executeIntent(whatsappNumber, commandResult, session)
        
        await recordParsingMetric({
          whatsappNumber,
          userId: session.userId,
          messageText: message,
          messageType: 'text',
          strategyUsed: strategy,
          intentAction: commandResult.action,
          confidence: commandResult.confidence,
          success: true,
          parseDurationMs: Date.now() - startTime
        })
        
        return result
      }
    }

    // Check authentication for natural language (required for cache and LLM)
    session = await getOrCreateSession(whatsappNumber)
    if (!session) {
      logger.warn('Natural language requires authentication', { whatsappNumber })
      await recordParsingMetric({
        whatsappNumber,
        messageText: message,
        messageType: 'text',
        strategyUsed: 'unknown',
        success: false,
        errorMessage: 'Authentication required',
        parseDurationMs: Date.now() - startTime
      })
      return messages.loginPrompt
    }
    
    await updateUserActivity(whatsappNumber)

    // LAYER 2: Semantic Cache Lookup (low cost)
    strategy = 'semantic_cache'
    const cachedIntent = await checkCache(session.userId, enhancedMessage)
    
    if (cachedIntent && cachedIntent.action !== 'unknown') {
      logger.info('Cache hit!', {
        whatsappNumber,
        userId: session.userId,
        action: cachedIntent.action,
        confidence: cachedIntent.confidence
      })
      
      // Check permissions for cached action
      const requiredPermission = ACTION_PERMISSION_MAP[cachedIntent.action]
      if (requiredPermission) {
        const authResult = await checkAuthorization(whatsappNumber)
        
        if (!authResult.authorized || !hasPermission(authResult.permissions, requiredPermission)) {
          const actionDesc = getActionDescription(cachedIntent.action)
          logger.warn('Permission denied for cached action', {
            whatsappNumber,
            action: cachedIntent.action
          })
          
          await recordParsingMetric({
            whatsappNumber,
            userId: session.userId,
            messageText: message,
            messageType: 'text',
            strategyUsed: strategy,
            intentAction: cachedIntent.action,
            confidence: cachedIntent.confidence,
            success: false,
            permissionRequired: requiredPermission,
            permissionGranted: false,
            errorMessage: 'Permission denied'
          })
          
          return messages.permissionDenied(actionDesc)
        }
      }
      
      const result = await executeIntent(whatsappNumber, cachedIntent, session)
      
      await recordParsingMetric({
        whatsappNumber,
        userId: session.userId,
        messageText: message,
        messageType: 'text',
        strategyUsed: strategy,
        intentAction: cachedIntent.action,
        confidence: cachedIntent.confidence,
        success: true,
        parseDurationMs: Date.now() - startTime
      })
      
      return result
    }

    // LAYER 3: LLM Function Calling (primary parser)
    if (!process.env.OPENAI_API_KEY) {
      logger.error('OpenAI API key not configured')
      await recordParsingMetric({
        whatsappNumber,
        userId: session.userId,
        messageText: message,
        messageType: 'text',
        strategyUsed: 'unknown',
        success: false,
        errorMessage: 'OpenAI not configured',
        parseDurationMs: Date.now() - startTime
      })
      return messages.unknownCommand
    }
    
    strategy = 'ai_function_calling'
    
    // Check daily AI usage limit
    const limitCheck = await checkDailyLimit(session.userId)
    if (!limitCheck.allowed) {
      logger.warn('Daily AI limit exceeded', {
        whatsappNumber,
        userId: session.userId
      })
      
      await recordParsingMetric({
        whatsappNumber,
        userId: session.userId,
        messageText: message,
        messageType: 'text',
        strategyUsed: strategy,
        success: false,
        errorMessage: 'Daily AI limit exceeded',
        parseDurationMs: Date.now() - startTime
      })
      
      return messages.aiLimitExceeded || 'Limite diário de uso de IA atingido. Use comandos explícitos como: /add 50 comida'
    }
    
    logger.info('Using LLM function calling', {
      whatsappNumber,
      userId: session.userId,
      hasQuote: !!quotedMessage
    })
    
    try {
      const userContext = await getUserContext(session.userId)
      const aiResult = await parseWithAI(enhancedMessage, userContext, quotedMessage)
      
      logger.info('LLM result', {
        whatsappNumber,
        userId: session.userId,
        action: aiResult.action,
        confidence: aiResult.confidence,
        parseDurationMs: Date.now() - startTime
      })
      
      // Check permissions
      const requiredPermission = ACTION_PERMISSION_MAP[aiResult.action]
      if (requiredPermission) {
        const authResult = await checkAuthorization(whatsappNumber)
        
        if (!authResult.authorized || !hasPermission(authResult.permissions, requiredPermission)) {
          const actionDesc = getActionDescription(aiResult.action)
          logger.warn('Permission denied for AI action', {
            whatsappNumber,
            action: aiResult.action
          })
          
          await recordParsingMetric({
            whatsappNumber,
            userId: session.userId,
            messageText: message,
            messageType: 'text',
            strategyUsed: strategy,
            intentAction: aiResult.action,
            confidence: aiResult.confidence,
            success: false,
            permissionRequired: requiredPermission,
            permissionGranted: false,
            errorMessage: 'Permission denied'
          })
          
          return messages.permissionDenied(actionDesc)
        }
      }
      
      // Execute the intent
      let result = await executeIntent(whatsappNumber, aiResult, session)
      
      // Save to cache for future use (async, don't wait)
      saveToCache(session.userId, message, aiResult)
      
      await recordParsingMetric({
        whatsappNumber,
        userId: session.userId,
        messageText: message,
        messageType: 'text',
        strategyUsed: strategy,
        intentAction: aiResult.action,
        confidence: aiResult.confidence,
        success: true,
        parseDurationMs: Date.now() - startTime
      })
      
      return result
    } catch (error) {
      logger.error('LLM parsing failed', {
        whatsappNumber,
        userId: session.userId
      }, error as Error)
      
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
      
      // Check if it's a limit exceeded error
      if (errorMessage.includes('limit exceeded')) {
        await recordParsingMetric({
          whatsappNumber,
          userId: session.userId,
          messageText: message,
          messageType: 'text',
          strategyUsed: strategy,
          success: false,
          errorMessage: 'Daily limit exceeded',
          parseDurationMs: Date.now() - startTime
        })
        
        return messages.aiLimitExceeded || 'Limite diário atingido. Use comandos explícitos como: /add 50 comida'
      }
      
      await recordParsingMetric({
        whatsappNumber,
        userId: session.userId,
        messageText: message,
        messageType: 'text',
        strategyUsed: strategy,
        success: false,
        errorMessage: errorMessage,
        parseDurationMs: Date.now() - startTime
      })
      
      return `❌ Erro ao processar: ${errorMessage}\n\n💡 Tente usar um comando explícito como: /add 50 comida`
    }
  } catch (error) {
    logger.error('Error in handleTextMessage', { whatsappNumber, strategy }, error as Error)
    
    await recordParsingMetric({
      whatsappNumber,
      userId: session?.userId,
      messageText: message,
      messageType: 'text',
      strategyUsed: strategy,
      success: false,
      errorMessage: (error as Error).message,
      parseDurationMs: Date.now() - startTime
    })
    
    return messages.genericError
  }
}

/**
 * Map intent actions to required permissions
 */
const ACTION_PERMISSION_MAP: Record<string, 'view' | 'add' | 'edit' | 'delete' | 'manage_budgets' | 'view_reports' | null> = {
  // View permissions
  'show_expenses': 'view',
  'list_transactions': 'view',
  'show_budget': 'view',
  'list_budgets': 'view',
  'show_transaction_details': 'view',
  
  // Add permissions
  'add_expense': 'add',
  'add_income': 'add',
  'add_recurring': 'add',
  'add_category': 'add',
  
  // Edit permissions
  'edit_transaction': 'edit',
  'change_category': 'edit',
  'edit_recurring': 'edit',
  
  // Delete permissions
  'delete_transaction': 'delete',
  'delete_recurring': 'delete',
  'remove_category': 'delete',
  'delete_budget': 'manage_budgets',
  
  // Budget management
  'set_budget': 'manage_budgets',
  
  // Reports & Analysis
  'show_report': 'view_reports',
  'quick_stats': 'view',
  'analyze_spending': 'view_reports',
  'search_transactions': 'view',
  
  // Recurring management
  'make_expense_recurring': 'add',
  
  // Undo - inherits permission from last action (no specific permission check)
  'undo_last': null,
  
  // Actions that don't require special permissions
  'logout': null,
  'show_help': null,
  'help': null,
  'list_categories': null,
  'show_recurring': null,
  'list_recurring': null,
}

/**
 * Get action description in Portuguese for permission denied messages
 */
function getActionDescription(action: string): string {
  const descriptions: Record<string, string> = {
    'show_expenses': 'visualizar despesas',
    'list_transactions': 'listar transações',
    'show_budget': 'visualizar orçamentos',
    'list_budgets': 'listar orçamentos',
    'add_expense': 'adicionar despesas',
    'add_income': 'adicionar receitas',
    'add_recurring': 'adicionar pagamentos recorrentes',
    'add_category': 'adicionar categorias',
    'delete_recurring': 'deletar pagamentos recorrentes',
    'set_budget': 'gerenciar orçamentos',
    'show_report': 'visualizar relatórios',
  }
  return descriptions[action] || 'realizar esta ação'
}

/**
 * Execute a parsed intent
 */
async function executeIntent(whatsappNumber: string, intent: any, session?: any): Promise<string | string[]> {
  const startTime = Date.now()
  
  logger.info('Executing intent', {
    whatsappNumber,
    userId: session?.userId,
    action: intent.action
  })
  
  try {
    // Handle multiple transactions
    if (intent.entities.transactions && intent.entities.transactions.length > 1) {
      const result = await handleMultipleTransactions(whatsappNumber, intent.entities.transactions)
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
          const categoryId = await getCategoryId(intent.entities.category)
          
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
        result = await handleAddExpense(whatsappNumber, intent)
        
        // Learn payment method preference
        if (intent.entities.category && intent.entities.paymentMethod) {
          const currentSession = session || await getUserSession(whatsappNumber)
          if (currentSession) {
            try {
              const categoryId = await getCategoryId(intent.entities.category)
              
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
        result = getCommandHelp(intent.entities.description)
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
 */
async function handleMultipleTransactions(whatsappNumber: string, transactions: any[]): Promise<string[]> {
  const messageList: string[] = []
  let successCount = 0

  logger.info('Processing multiple transactions', {
    whatsappNumber,
    count: transactions.length
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
      
      const result = await handleAddExpense(whatsappNumber, intent)
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

async function handleImageMessage(
  whatsappNumber: string, 
  imageBuffer: Buffer, 
  caption?: string
): Promise<string | string[]> {
  logger.info('Handling image message', {
    whatsappNumber,
    hasCaption: !!caption,
    imageSize: imageBuffer.length
  })
  
  const startTime = Date.now()
  
  // Check authentication (auto-auth if authorized)
  const session = await getOrCreateSession(whatsappNumber)
  
  if (!session) {
    await recordParsingMetric({
      whatsappNumber,
      messageText: caption || '[image]',
      messageType: 'image',
      strategyUsed: 'unknown',
      success: false,
      errorMessage: 'Authentication required'
    })
    return messages.loginPrompt
  }

  await updateUserActivity(whatsappNumber)

  try {
    // Process image with OCR
    const expenses = await extractExpenseFromImage(imageBuffer)

    if (!expenses || expenses.length === 0) {
      logger.warn('No expenses found in image', { whatsappNumber, userId: session.userId })
      await recordParsingMetric({
        userId: session.userId,
        whatsappNumber,
        messageText: caption || '[image]',
        messageType: 'image',
        strategyUsed: 'unknown',
        success: false,
        errorMessage: 'No data extracted from image',
        parseDurationMs: Date.now() - startTime
      })
      return messages.ocrNoData
    }

    logger.info('Expenses extracted from image', {
      whatsappNumber,
      userId: session.userId,
      count: expenses.length
    })

    // Handle multiple transactions from image
    if (expenses.length > 1) {
      const transactions = expenses.map(expense => ({
        amount: expense.amount,
        category: expense.category,
        description: expense.description,
        type: expense.type,
        date: expense.date,
        paymentMethod: expense.paymentMethod,
      }))

      const intent = {
        action: 'add_expense' as const,
        confidence: 0.8,
        entities: { transactions }
      }

      const result = await executeIntent(whatsappNumber, intent, session)
      
      await recordParsingMetric({
        userId: session.userId,
        whatsappNumber,
        messageText: caption || '[image]',
        messageType: 'image',
        strategyUsed: 'local_nlp',
        intentAction: 'add_expense',
        confidence: 0.8,
        success: true,
        parseDurationMs: Date.now() - startTime
      })
      
      if (Array.isArray(result)) {
        // For multiple transactions, add OCR success message to the first message
        result[0] = `${messages.ocrSuccess(expenses.length)}\n\n${result[0]}`
        return result
      } else {
        return `${messages.ocrSuccess(expenses.length)}\n\n${result}`
      }
    }

    // Single transaction
    const expense = expenses[0]
    const intent = {
      action: 'add_expense' as const,
      confidence: 0.8,
      entities: {
        amount: expense.amount,
        category: expense.category,
        description: expense.description,
        type: expense.type,
        date: expense.date,
        paymentMethod: expense.paymentMethod,
      }
    }

    // If there's a caption, use it to enhance the expense
    if (caption) {
      const captionIntent = parseIntent(caption)
      
      // Merge caption data with OCR data
      if (captionIntent.entities.category) {
        intent.entities.category = captionIntent.entities.category
      }
      if (captionIntent.entities.description) {
        intent.entities.description = captionIntent.entities.description
      }
      if (captionIntent.entities.date) {
        intent.entities.date = captionIntent.entities.date
      }
      if (captionIntent.entities.paymentMethod) {
        intent.entities.paymentMethod = captionIntent.entities.paymentMethod
      }
    }

    const result = await executeIntent(whatsappNumber, intent, session)
    
    await recordParsingMetric({
      userId: session.userId,
      whatsappNumber,
      messageText: caption || '[image]',
      messageType: 'image',
      strategyUsed: 'local_nlp',
      intentAction: 'add_expense',
      confidence: 0.8,
      success: true,
      parseDurationMs: Date.now() - startTime
    })
    
    return `${messages.ocrSuccess(1)}\n\n${result}`
  } catch (error) {
    logger.error('Error processing image', { whatsappNumber, userId: session.userId }, error as Error)
    await recordParsingMetric({
      userId: session.userId,
      whatsappNumber,
      messageText: caption || '[image]',
      messageType: 'image',
      strategyUsed: 'unknown',
      success: false,
      errorMessage: (error as Error).message,
      parseDurationMs: Date.now() - startTime
    })
    return messages.ocrError
  }
}

