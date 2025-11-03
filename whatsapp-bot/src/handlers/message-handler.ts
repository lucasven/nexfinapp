import { MessageContext } from '../types'
import { parseIntent } from '../nlp/intent-parser'
import { getUserSession, updateUserActivity, createUserSession } from '../auth/session-manager'
import { handleLogin, handleLogout } from './auth'
import { handleAddExpense, handleShowExpenses } from './expenses'
import { handleSetBudget, handleShowBudgets } from './budgets'
import { handleAddRecurring, handleShowRecurring, handleDeleteRecurring } from './recurring'
import { handleShowReport } from './reports'
import { handleListCategories, handleAddCategory } from './categories'
import { extractExpenseFromImage } from '../ocr/image-processor'
import { messages } from '../localization/pt-br'
import { parseCommand, executeCommand, getCommandHelp } from '../nlp/command-parser'
import { getUserPatterns, matchLearnedPattern, updatePatternSuccess, updatePatternFailure } from '../nlp/pattern-storage'
import { parseWithAI, generatePattern, savePattern, getUserContext, createCorrectedPattern, parseUserCorrection } from '../nlp/ai-pattern-generator'
import { getSuggestedPaymentMethod, updatePaymentMethodPreference } from '../nlp/pattern-storage'
import { getSupabaseClient } from '../services/supabase-client'
import { storeCorrectionState, getAndClearCorrectionState, hasCorrectionState } from '../nlp/correction-state'
import { hasPendingTransaction, handleDuplicateConfirmation, storePendingTransaction } from './duplicate-confirmation'
import { detectCorrectionIntent } from '../services/correction-detector'
import { handleTransactionCorrection } from './transaction-corrections'
import { checkAuthorization, hasPermission } from '../middleware/authorization'

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
    console.error('Error looking up category ID:', error)
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
    console.log(`Auto-authenticating WhatsApp number: ${whatsappNumber}`)
    await createUserSession(whatsappNumber, authResult.userId)
    session = await getUserSession(whatsappNumber)
    return session
  }

  return null
}

export async function handleMessage(context: MessageContext): Promise<string | string[] | null> {
  const { from, isGroup, message, hasImage, imageBuffer } = context

  // Handle group messages - only respond if mentioned or starts with "bot"
  console.log('message: ', message);
  if (isGroup) {
    const shouldRespond = message.toLowerCase().includes('bot') || 
                         message.toLowerCase().includes('@bot')
    
    if (!shouldRespond && !hasImage) {
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
  // Check if user has a pending correction state
  if (hasCorrectionState(whatsappNumber)) {
    return await handleUserCorrection(whatsappNumber, message)
  }

  // Check if user has a pending duplicate confirmation
  if (hasPendingTransaction(whatsappNumber)) {
    return await handleDuplicateConfirmation(whatsappNumber, message)
  }

  // Check for transaction correction intent
  const correctionIntent = detectCorrectionIntent(message)
  if (correctionIntent.action !== 'unknown' && correctionIntent.confidence >= 0.5) {
    return await handleTransactionCorrection(whatsappNumber, correctionIntent)
  }

  // 1. Try explicit command first
  const command = parseCommand(message)
  if (command) {
    // Handle help command without authentication
    if (command.type === 'help') {
      return getCommandHelp(command.args[0])
    }
    
    // Check authentication for other commands (auto-auth if authorized)
    const session = await getOrCreateSession(whatsappNumber)
    if (!session) {
      return messages.loginPrompt
    }
    
    await updateUserActivity(whatsappNumber)
    
    const intent = executeCommand(command)
    if (intent) {
      const result = await executeIntent(whatsappNumber, intent)
      return result
    }
  }

  // 2. Try learned patterns (requires authentication, auto-auth if authorized)
  let session = await getOrCreateSession(whatsappNumber)
  if (session) {
    await updateUserActivity(whatsappNumber)
    
    const patterns = await getUserPatterns(session.userId)
        const learnedResult = matchLearnedPattern(message, patterns)
        if (learnedResult) {
          const result = await executeIntent(whatsappNumber, learnedResult)
          return result
        }
  }

  // 3. Try local NLP
  const localResult = parseIntent(message)
  
  // Handle login and help without authentication
  if (localResult.action === 'login') {
    return await handleLogin(whatsappNumber, localResult.entities.description || '')
  }
  
  if (localResult.action === 'help') {
    return messages.welcome
  }
  
  // Check authentication for other actions (auto-auth if authorized)
  if (!session && localResult.action !== 'unknown') {
    session = await getOrCreateSession(whatsappNumber)
    if (!session) {
      return messages.loginPrompt
    }
  }
  
  if (session) {
    await updateUserActivity(whatsappNumber)
  }
  
  // Use local NLP if confidence is high enough
  if (localResult.confidence >= 0.8) {
    const result = await executeIntent(whatsappNumber, localResult)
    return result
  }

  // 4. AI Pattern Generation (if enabled and authenticated)
  if (process.env.OPENAI_API_KEY && session) {
    try {
      const userContext = await getUserContext(session.userId)
      const aiResult = await parseWithAI(message, userContext)
      
      // Store correction state for potential user correction
      storeCorrectionState(whatsappNumber, message, aiResult)
      
      // Execute the AI result immediately
      const result = await executeIntent(whatsappNumber, aiResult)
      
      // Generate and save pattern for future use
      try {
        const pattern = await generatePattern(message, aiResult)
        await savePattern(session.userId, pattern, message, aiResult)
        
        // If result is an array, we need to handle it differently
        if (Array.isArray(result)) {
          // For multiple transactions, add the AI message to the last message
          result[result.length - 1] += '\n\n🤖 Processado via IA - padrão salvo para o futuro!\n\n💡 Se algo estiver errado, me diga como deveria ser!'
          return result
        } else {
          return result + '\n\n🤖 Processado via IA - padrão salvo para o futuro!\n\n💡 Se algo estiver errado, me diga como deveria ser!'
        }
      } catch (patternError) {
        console.error('Error saving pattern:', patternError)
        if (Array.isArray(result)) {
          result[result.length - 1] += '\n\n🤖 Processado via IA\n\n💡 Se algo estiver errado, me diga como deveria ser!'
          return result
        } else {
          return result + '\n\n🤖 Processado via IA\n\n💡 Se algo estiver errado, me diga como deveria ser!'
        }
      }
    } catch (error) {
      console.error('AI parsing failed:', error)
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
      return `❌ Erro no processamento via IA: ${errorMessage}\n\n💡 Tente usar um comando explícito como: /add 50 comida`
    }
  }

  // 5. Unknown command
  return messages.unknownCommand
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
async function executeIntent(whatsappNumber: string, intent: any): Promise<string | string[]> {
  // Check permissions for this action
  const requiredPermission = ACTION_PERMISSION_MAP[intent.action]
  
  if (requiredPermission) {
    const authResult = await checkAuthorization(whatsappNumber)
    
    if (!authResult.authorized) {
      return messages.unauthorizedNumber
    }
    
    if (!hasPermission(authResult.permissions, requiredPermission)) {
      const actionDesc = getActionDescription(intent.action)
      return messages.permissionDenied(actionDesc)
    }
  }

  // Handle multiple transactions
  if (intent.entities.transactions && intent.entities.transactions.length > 1) {
    return await handleMultipleTransactions(whatsappNumber, intent.entities.transactions)
  }
  
  // Add payment method suggestion if not provided
  if (intent.action === 'add_expense' && intent.entities.category && !intent.entities.paymentMethod) {
    const session = await getUserSession(whatsappNumber)
    if (session) {
      try {
        // First, look up the category ID from the category name
        const categoryId = await getCategoryId(intent.entities.category)
        
        if (categoryId) {
          const suggestedPaymentMethod = await getSuggestedPaymentMethod(session.userId, categoryId)
          if (suggestedPaymentMethod) {
            intent.entities.paymentMethod = suggestedPaymentMethod
          }
        }
      } catch (error) {
        console.error('Error getting payment method suggestion:', error)
        // Continue without payment method suggestion
      }
    }
  }

  // Route to appropriate handler
  switch (intent.action) {
    case 'logout':
      return await handleLogout(whatsappNumber)

    case 'add_expense':
    case 'add_income':
      const result = await handleAddExpense(whatsappNumber, intent)
      
      // Learn payment method preference
      if (intent.entities.category && intent.entities.paymentMethod) {
        const session = await getUserSession(whatsappNumber)
        if (session) {
          try {
            // Look up the category ID from the category name
            const categoryId = await getCategoryId(intent.entities.category)
            
            if (categoryId) {
              await updatePaymentMethodPreference(
                session.userId, 
                categoryId, 
                intent.entities.paymentMethod
              )
            }
          } catch (error) {
            console.error('Error learning payment method preference:', error)
            // Continue without learning the preference
          }
        }
      }
      
      return result

    case 'show_expenses':
      return await handleShowExpenses(whatsappNumber)

    case 'set_budget':
      return await handleSetBudget(whatsappNumber, intent)

    case 'show_budget':
      return await handleShowBudgets(whatsappNumber)

    case 'add_recurring':
      return await handleAddRecurring(whatsappNumber, intent)

    case 'show_recurring':
      return await handleShowRecurring(whatsappNumber)

    case 'delete_recurring':
      return await handleDeleteRecurring(whatsappNumber)

    case 'show_report':
      return await handleShowReport(whatsappNumber, intent)

    case 'list_categories':
      return await handleListCategories(whatsappNumber)

    case 'add_category':
      return await handleAddCategory(whatsappNumber, intent)

    case 'list_transactions':
      return await handleShowExpenses(whatsappNumber)

    case 'list_recurring':
      return await handleShowRecurring(whatsappNumber)

    case 'list_budgets':
      return await handleShowBudgets(whatsappNumber)

    case 'show_help':
      return getCommandHelp(intent.entities.description)

    default:
      return messages.unknownCommand
  }
}

/**
 * Handle multiple transactions in a single message
 * Returns an array of messages to send individually
 */
async function handleMultipleTransactions(whatsappNumber: string, transactions: any[]): Promise<string[]> {
  const messages: string[] = []
  let successCount = 0

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
      console.error('Error processing transaction:', error)
      messages.push(`${i + 1}/${transactions.length} - ❌ Erro ao processar: ${transaction.description || 'transação'}`)
    }
  }
  
  // Send summary message
  messages.push(`\n✅ Concluído! ${successCount}/${transactions.length} transações processadas com sucesso.`)
  
  return messages
}

/**
 * Handle user correction of AI result
 */
async function handleUserCorrection(whatsappNumber: string, correctionMessage: string): Promise<string | string[]> {
  const session = await getOrCreateSession(whatsappNumber)
  if (!session) {
    return messages.loginPrompt
  }

  const correctionState = getAndClearCorrectionState(whatsappNumber)
  if (!correctionState) {
    return '❌ Não encontrei o contexto da correção. Tente novamente.'
  }

  try {
    // Parse the user's correction
    const userContext = await getUserContext(session.userId)
    const correctedIntent = await parseUserCorrection(correctionMessage, userContext)
    
    if (!correctedIntent) {
      return '❌ Não consegui entender sua correção. Tente ser mais específico.'
    }

    // Execute the corrected intent
    const result = await executeIntent(whatsappNumber, correctedIntent)
    
    // Create a corrected pattern based on the original message and correction
    try {
      const correctedPattern = await createCorrectedPattern(
        correctionState.originalMessage,
        correctionMessage,
        session.userId
      )
      
      if (correctedPattern) {
        await savePattern(session.userId, correctedPattern, correctionState.originalMessage, correctedIntent)
        
        if (Array.isArray(result)) {
          result[result.length - 1] += '\n\n🧠 Criei um padrão corrigido para o futuro!'
          return result
        } else {
          return `✅ Correção aplicada!\n\n${result}\n\n🧠 Criei um padrão corrigido para o futuro!`
        }
      } else {
        if (Array.isArray(result)) {
          return result
        } else {
          return `✅ Correção aplicada!\n\n${result}`
        }
      }
    } catch (patternError) {
      console.error('Error creating corrected pattern:', patternError)
      if (Array.isArray(result)) {
        return result
      } else {
        return `✅ Correção aplicada!\n\n${result}`
      }
    }
  } catch (error) {
    console.error('Error handling user correction:', error)
    return '❌ Erro ao processar sua correção. Tente novamente.'
  }
}


async function handleImageMessage(
  whatsappNumber: string, 
  imageBuffer: Buffer, 
  caption?: string
): Promise<string | string[]> {
  // Check authentication (auto-auth if authorized)
  const session = await getOrCreateSession(whatsappNumber)
  
  if (!session) {
    return messages.loginPrompt
  }

  await updateUserActivity(whatsappNumber)

  try {
    // Process image with OCR
    const expenses = await extractExpenseFromImage(imageBuffer)

    if (!expenses || expenses.length === 0) {
      return messages.ocrNoData
    }

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

      const result = await executeIntent(whatsappNumber, intent)
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

    const result = await executeIntent(whatsappNumber, intent)
    
    return `${messages.ocrSuccess(1)}\n\n${result}`
  } catch (error) {
    console.error('Error processing image:', error)
    return messages.ocrError
  }
}

