import { MessageContext } from '../types.js'
import { parseIntent, getCommandHelp } from '../nlp/intent-parser.js'
import { getUserSession, updateUserActivity, createUserSession } from '../auth/session-manager.js'
import { handleLogin, handleLogout } from './auth.js'
import { handleAddExpense, handleShowExpenses } from './expenses.js'
import { handleSetBudget, handleShowBudgets } from './budgets.js'
import { handleAddRecurring, handleShowRecurring, handleDeleteRecurring } from './recurring.js'
import { handleShowReport } from './reports.js'
import { handleListCategories, handleAddCategory } from './categories.js'
import { handleChangeCategory, handleEditTransaction } from './transactions.js'
import { extractExpenseFromImage } from '../ocr/image-processor.js'
import { messages } from '../localization/pt-br.js'
import { getUserPatterns, matchLearnedPattern } from '../nlp/pattern-storage.js'
import { parseWithAI, generatePattern, savePattern, getUserContext, createCorrectedPattern, parseUserCorrection } from '../nlp/ai-pattern-generator.js'
import { getSuggestedPaymentMethod, updatePaymentMethodPreference } from '../nlp/pattern-storage.js'
import { getSupabaseClient } from '../services/supabase-client.js'
import { storeCorrectionState, getAndClearCorrectionState, hasCorrectionState, updateCorrectionStateTransactionId } from '../nlp/correction-state.js'
import { hasPendingTransaction, handleDuplicateConfirmation } from './duplicate-confirmation.js'
import { detectCorrectionIntent } from '../services/correction-detector.js'
import { handleTransactionCorrection } from './transaction-corrections.js'
import { checkAuthorization, hasPermission } from '../middleware/authorization.js'
import { logger } from '../services/logger.js'
import { recordParsingMetric, ParsingStrategy, MessageType } from '../services/metrics-tracker.js'

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
  const { from, isGroup, message, hasImage, imageBuffer } = context

  logger.info('Message received', {
    from,
    isGroup,
    hasImage,
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

  return await handleTextMessage(from, message)
}

async function handleTextMessage(whatsappNumber: string, message: string): Promise<string | string[]> {
  const startTime = Date.now()
  let strategy: ParsingStrategy = 'unknown'
  let intent: any = null
  let session: any = null
  
  try {
    // Check if user has a pending correction state
    if (hasCorrectionState(whatsappNumber)) {
      strategy = 'correction_state'
      logger.info('Using correction state strategy', { whatsappNumber, strategy })
      const result = await handleUserCorrection(whatsappNumber, message)
      
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

    // Check if user has a pending duplicate confirmation
    if (hasPendingTransaction(whatsappNumber)) {
      strategy = 'duplicate_confirmation'
      logger.info('Using duplicate confirmation strategy', { whatsappNumber, strategy })
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

    // Check for transaction correction intent
    const correctionIntent = detectCorrectionIntent(message)
    if (correctionIntent.action !== 'unknown' && correctionIntent.confidence >= 0.5) {
      strategy = 'correction_intent'
      logger.info('Using correction intent strategy', { whatsappNumber, strategy, confidence: correctionIntent.confidence })
      const result = await handleTransactionCorrection(whatsappNumber, correctionIntent)
      
      await recordParsingMetric({
        whatsappNumber,
        messageText: message,
        messageType: 'text',
        strategyUsed: strategy,
        intentAction: correctionIntent.action,
        confidence: correctionIntent.confidence,
        success: true,
        parseDurationMs: Date.now() - startTime
      })
      
      return result
    }

    // Try local NLP parsing (includes explicit commands now)
    const localResult = parseIntent(message)
    const parseTime = Date.now() - startTime
    
    logger.info('Local NLP parsing result', {
      whatsappNumber,
      action: localResult.action,
      confidence: localResult.confidence,
      parseDurationMs: parseTime
    })
    
    // Handle login and help without authentication
    if (localResult.action === 'login') {
      strategy = 'local_nlp'
      const result = await handleLogin(whatsappNumber, localResult.entities.description || '')
      
      await recordParsingMetric({
        whatsappNumber,
        messageText: message,
        messageType: 'text',
        strategyUsed: strategy,
        intentAction: localResult.action,
        confidence: localResult.confidence,
        success: true,
        parseDurationMs: parseTime
      })
      
      return result
    }
    
    if (localResult.action === 'help') {
      strategy = 'local_nlp'
      const result = localResult.entities.description ? getCommandHelp(localResult.entities.description) : messages.welcome
      
      await recordParsingMetric({
        whatsappNumber,
        messageText: message,
        messageType: 'text',
        strategyUsed: strategy,
        intentAction: localResult.action,
        confidence: localResult.confidence,
        success: true,
        parseDurationMs: parseTime
      })
      
      return result
    }
    
    // Check authentication for other actions (auto-auth if authorized)
    session = await getOrCreateSession(whatsappNumber)
    
    // Try learned patterns if authenticated
    if (session && localResult.action === 'unknown') {
      await updateUserActivity(whatsappNumber)
      
      const patterns = await getUserPatterns(session.userId)
      const learnedResult = matchLearnedPattern(message, patterns)
      
      if (learnedResult) {
        strategy = 'learned_pattern'
        logger.info('Matched learned pattern', {
          whatsappNumber,
          userId: session.userId,
          action: learnedResult.action,
          confidence: learnedResult.confidence
        })
        
        const result = await executeIntent(whatsappNumber, learnedResult, session)
        
        await recordParsingMetric({
          userId: session.userId,
          whatsappNumber,
          messageText: message,
          messageType: 'text',
          strategyUsed: strategy,
          intentAction: learnedResult.action,
          confidence: learnedResult.confidence,
          success: true,
          parseDurationMs: Date.now() - startTime
        })
        
        return result
      }
    }
    
    // Use local NLP if confidence is high enough
    if (localResult.confidence >= 0.8) {
      strategy = localResult.action.startsWith('/') ? 'explicit_command' : 'local_nlp'
      
      // Check for required session
      if (!session && localResult.action !== 'unknown') {
        logger.warn('Action requires authentication but no session', {
          whatsappNumber,
          action: localResult.action
        })
        
        await recordParsingMetric({
          whatsappNumber,
          messageText: message,
          messageType: 'text',
          strategyUsed: strategy,
          intentAction: localResult.action,
          confidence: localResult.confidence,
          success: false,
          errorMessage: 'Authentication required'
        })
        
        return messages.loginPrompt
      }
      
      if (session) {
        await updateUserActivity(whatsappNumber)
      }
      
      // EARLY PERMISSION CHECK - before execution
      const requiredPermission = ACTION_PERMISSION_MAP[localResult.action]
      if (requiredPermission) {
        const authResult = await checkAuthorization(whatsappNumber)
        
        if (!authResult.authorized) {
          logger.warn('Unauthorized number attempted action', {
            whatsappNumber,
            action: localResult.action
          })
          
          await recordParsingMetric({
            userId: session?.userId,
            whatsappNumber,
            messageText: message,
            messageType: 'text',
            strategyUsed: strategy,
            intentAction: localResult.action,
            confidence: localResult.confidence,
            success: false,
            permissionRequired: requiredPermission,
            permissionGranted: false,
            errorMessage: 'Unauthorized number'
          })
          
          return messages.unauthorizedNumber
        }
        
        if (!hasPermission(authResult.permissions, requiredPermission)) {
          const actionDesc = getActionDescription(localResult.action)
          logger.warn('Permission denied for action', {
            whatsappNumber,
            action: localResult.action,
            required: requiredPermission,
            permissions: authResult.permissions
          })
          
          await recordParsingMetric({
            userId: session?.userId,
            whatsappNumber,
            messageText: message,
            messageType: 'text',
            strategyUsed: strategy,
            intentAction: localResult.action,
            confidence: localResult.confidence,
            success: false,
            permissionRequired: requiredPermission,
            permissionGranted: false,
            errorMessage: 'Permission denied'
          })
          
          return messages.permissionDenied(actionDesc)
        }
      }
      
      const result = await executeIntent(whatsappNumber, localResult, session)
      
      await recordParsingMetric({
        userId: session?.userId,
        whatsappNumber,
        messageText: message,
        messageType: 'text',
        strategyUsed: strategy,
        intentAction: localResult.action,
        confidence: localResult.confidence,
        success: true,
        permissionRequired: requiredPermission || undefined,
        permissionGranted: requiredPermission ? true : undefined,
        parseDurationMs: Date.now() - startTime
      })
      
      return result
    }

    // AI Pattern Generation (if enabled and authenticated)
    if (process.env.OPENAI_API_KEY && session) {
      strategy = 'ai_pattern'
      logger.info('Attempting AI pattern generation', {
        whatsappNumber,
        userId: session.userId
      })
      
      try {
        const userContext = await getUserContext(session.userId)
        const aiResult = await parseWithAI(message, userContext)
        const aiParseTime = Date.now() - startTime
        
        logger.info('AI parsing result', {
          whatsappNumber,
          userId: session.userId,
          action: aiResult.action,
          confidence: aiResult.confidence,
          parseDurationMs: aiParseTime
        })
        
        // Store correction state for potential user correction
        storeCorrectionState(whatsappNumber, message, aiResult)
        
        // EARLY PERMISSION CHECK for AI result - before execution
        const requiredPermission = ACTION_PERMISSION_MAP[aiResult.action]
        if (requiredPermission) {
          const authResult = await checkAuthorization(whatsappNumber)
          
          if (!authResult.authorized || !hasPermission(authResult.permissions, requiredPermission)) {
            const actionDesc = getActionDescription(aiResult.action)
            logger.warn('Permission denied for AI-parsed action', {
              whatsappNumber,
              action: aiResult.action,
              required: requiredPermission
            })
            
            await recordParsingMetric({
              userId: session.userId,
              whatsappNumber,
              messageText: message,
              messageType: 'text',
              strategyUsed: strategy,
              intentAction: aiResult.action,
              confidence: aiResult.confidence,
              success: false,
              permissionRequired: requiredPermission,
              permissionGranted: false,
              errorMessage: 'Permission denied',
              parseDurationMs: aiParseTime
            })
            
            return messages.permissionDenied(actionDesc)
          }
        }
        
        // Execute the AI result with error handling
        let result: string | string[]
        let executionSuccess = false
        
        try {
          result = await executeIntent(whatsappNumber, aiResult, session)
          executionSuccess = true
          
          // Extract transaction ID from result if this was an add_expense/add_income action
          if ((aiResult.action === 'add_expense' || aiResult.action === 'add_income') && typeof result === 'string') {
            const transactionIdMatch = result.match(/🆔 ID: ([A-Z0-9]{6})/)
            if (transactionIdMatch) {
              updateCorrectionStateTransactionId(whatsappNumber, transactionIdMatch[1])
              logger.debug('Updated correction state with transaction ID', {
                whatsappNumber,
                transactionId: transactionIdMatch[1]
              })
            }
          }
          
          // ONLY save pattern if execution succeeded
          try {
            const pattern = await generatePattern(message, aiResult)
            await savePattern(session.userId, pattern, message, aiResult)
            
            logger.info('AI pattern saved successfully', {
              whatsappNumber,
              userId: session.userId,
              action: aiResult.action
            })
            
            // Add feedback message if enabled
            if (SHOW_PARSING_FEEDBACK) {
              if (Array.isArray(result)) {
                result[result.length - 1] += '\n\n🤖 Processado via IA - padrão salvo para o futuro!\n\n💡 Se algo estiver errado, me diga como deveria ser!'
              } else {
                result = result + '\n\n🤖 Processado via IA - padrão salvo para o futuro!\n\n💡 Se algo estiver errado, me diga como deveria ser!'
              }
            }
          } catch (patternError) {
            logger.error('Error saving AI pattern', { whatsappNumber, userId: session.userId }, patternError as Error)
            // Continue without saving pattern
            if (SHOW_PARSING_FEEDBACK) {
              if (Array.isArray(result)) {
                result[result.length - 1] += '\n\n🤖 Processado via IA\n\n💡 Se algo estiver errado, me diga como deveria ser!'
              } else {
                result = result + '\n\n🤖 Processado via IA\n\n💡 Se algo estiver errado, me diga como deveria ser!'
              }
            }
          }
        } catch (executionError) {
          logger.error('AI result execution failed', {
            whatsappNumber,
            userId: session.userId,
            action: aiResult.action
          }, executionError as Error)
          
          await recordParsingMetric({
            userId: session.userId,
            whatsappNumber,
            messageText: message,
            messageType: 'text',
            strategyUsed: strategy,
            intentAction: aiResult.action,
            confidence: aiResult.confidence,
            success: false,
            errorMessage: (executionError as Error).message,
            parseDurationMs: Date.now() - startTime
          })
          
          throw executionError
        }
        
        await recordParsingMetric({
          userId: session.userId,
          whatsappNumber,
          messageText: message,
          messageType: 'text',
          strategyUsed: strategy,
          intentAction: aiResult.action,
          confidence: aiResult.confidence,
          success: executionSuccess,
          permissionRequired: requiredPermission || undefined,
          permissionGranted: requiredPermission ? true : undefined,
          parseDurationMs: Date.now() - startTime
        })
        
        return result
      } catch (error) {
        logger.error('AI parsing failed', { whatsappNumber, userId: session?.userId }, error as Error)
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
        
        await recordParsingMetric({
          userId: session?.userId,
          whatsappNumber,
          messageText: message,
          messageType: 'text',
          strategyUsed: strategy,
          success: false,
          errorMessage: errorMessage,
          parseDurationMs: Date.now() - startTime
        })
        
        return `❌ Erro no processamento via IA: ${errorMessage}\n\n💡 Tente usar um comando explícito como: /add 50 comida`
      }
    }

    // Unknown command
    logger.info('No parsing strategy matched', {
      whatsappNumber,
      localAction: localResult.action,
      localConfidence: localResult.confidence,
      hasSession: !!session,
      hasOpenAI: !!process.env.OPENAI_API_KEY
    })
    
    await recordParsingMetric({
      userId: session?.userId,
      whatsappNumber,
      messageText: message,
      messageType: 'text',
      strategyUsed: 'unknown',
      success: false,
      errorMessage: 'No strategy matched',
      parseDurationMs: Date.now() - startTime
    })
    
    return messages.unknownCommand
  } catch (error) {
    logger.error('Error in handleTextMessage', { whatsappNumber, strategy }, error as Error)
    
    await recordParsingMetric({
      userId: session?.userId,
      whatsappNumber,
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
  
  // Add permissions
  'add_expense': 'add',
  'add_income': 'add',
  'add_recurring': 'add',
  'add_category': 'add',
  
  // Edit permissions (currently no edit actions defined)
  
  // Delete permissions
  'delete_recurring': 'delete',
  
  // Budget management
  'set_budget': 'manage_budgets',
  
  // Reports
  'show_report': 'view_reports',
  
  // Actions that don't require special permissions
  'logout': null,
  'show_help': null,
  'help': null,
  'list_categories': null,
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
    // Check permissions for this action
    const requiredPermission = ACTION_PERMISSION_MAP[intent.action]
    
    if (requiredPermission) {
      const authResult = await checkAuthorization(whatsappNumber)
      
      if (!authResult.authorized) {
        logger.warn('Unauthorized number in executeIntent', { whatsappNumber, action: intent.action })
        return messages.unauthorizedNumber
      }
      
      if (!hasPermission(authResult.permissions, requiredPermission)) {
        const actionDesc = getActionDescription(intent.action)
        logger.warn('Permission denied in executeIntent', {
          whatsappNumber,
          action: intent.action,
          required: requiredPermission
        })
        return messages.permissionDenied(actionDesc)
      }
    }

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

      case 'change_category':
        if (!intent.entities.transactionId || !intent.entities.category) {
          result = '❌ Para mudar a categoria, é necessário informar a transação e a nova categoria.'
          break
        }
        result = await handleChangeCategory(
          whatsappNumber,
          intent.entities.transactionId,
          intent.entities.category
        )
        break

      case 'edit_transaction':
        if (!intent.entities.transactionId) {
          result = '❌ Para editar uma transação, é necessário informar seu ID.'
          break
        }
        result = await handleEditTransaction(whatsappNumber, intent)
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
  const messages: string[] = []
  let successCount = 0

  logger.info('Processing multiple transactions', {
    whatsappNumber,
    count: transactions.length
  })

  // Send initial message about processing multiple transactions
  messages.push(`📋 Processando ${transactions.length} transações...`)

  for (let i = 0; i < transactions.length; i++) {
    const transaction = transactions[i]
    try {
      const intent = {
        action: 'add_expense' as const,
        confidence: 0.9,
        entities: transaction
      }
      
      const result = await handleAddExpense(whatsappNumber, intent)
      messages.push(`${i + 1}/${transactions.length} - ${result}`)
      successCount++
    } catch (error) {
      logger.error('Error processing transaction in batch', {
        whatsappNumber,
        index: i,
        description: transaction.description
      }, error as Error)
      messages.push(`${i + 1}/${transactions.length} - ❌ Erro ao processar: ${transaction.description || 'transação'}`)
    }
  }
  
  // Send summary message
  messages.push(`\n✅ Concluído! ${successCount}/${transactions.length} transações processadas com sucesso.`)
  
  logger.info('Multiple transactions completed', {
    whatsappNumber,
    total: transactions.length,
    successful: successCount
  })
  
  return messages
}

/**
 * Handle user correction of AI result
 */
async function handleUserCorrection(whatsappNumber: string, correctionMessage: string): Promise<string | string[]> {
  logger.info('Handling user correction', { whatsappNumber })
  
  const session = await getOrCreateSession(whatsappNumber)
  if (!session) {
    return messages.loginPrompt
  }

  const correctionState = getAndClearCorrectionState(whatsappNumber)
  if (!correctionState) {
    logger.warn('No correction state found', { whatsappNumber })
    return '❌ Não encontrei o contexto da correção. Tente novamente.'
  }

  try {
    // Parse the user's correction
    const userContext = await getUserContext(session.userId)
    const correctedIntent = await parseUserCorrection(
      correctionMessage, 
      userContext,
      correctionState.transactionId  // Pass transaction ID if available
    )
    
    if (!correctedIntent) {
      logger.warn('Could not parse user correction', { whatsappNumber, correctionMessage })
      return '❌ Não consegui entender sua correção. Tente ser mais específico.'
    }

    logger.info('Parsed correction intent', {
      whatsappNumber,
      action: correctedIntent.action,
      transactionId: correctionState.transactionId
    })

    // Execute the corrected intent
    const result = await executeIntent(whatsappNumber, correctedIntent, session)
    
    // Create a corrected pattern based on the original message and correction
    try {
      const correctedPattern = await createCorrectedPattern(
        correctionState.originalMessage,
        correctionMessage,
        session.userId
      )
      
      if (correctedPattern) {
        await savePattern(session.userId, correctedPattern, correctionState.originalMessage, correctedIntent)
        
        logger.info('Corrected pattern saved', {
          whatsappNumber,
          userId: session.userId
        })
        
        if (Array.isArray(result)) {
          result[result.length - 1] += '\n\n🧠 Criei um padrão corrigido para o futuro!'
          return result
        } else {
          return `${result}\n\n🧠 Criei um padrão para lembrar essa decisão no futuro!`
        }
      } else {
        if (Array.isArray(result)) {
          return result
        } else {
          return `✅ Correção aplicada!\n\n${result}`
        }
      }
    } catch (patternError) {
      logger.error('Error creating corrected pattern', { whatsappNumber, userId: session.userId }, patternError as Error)
      if (Array.isArray(result)) {
        return result
      } else {
        return `✅ Correção aplicada!\n\n${result}`
      }
    }
  } catch (error) {
    logger.error('Error handling user correction', { whatsappNumber }, error as Error)
    return '❌ Erro ao processar sua correção. Tente novamente.'
  }
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
