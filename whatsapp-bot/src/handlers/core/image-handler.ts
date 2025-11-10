/**
 * Image Message Handler
 * OCR processing with AI category refinement
 */

import { getUserSession, updateUserActivity, createUserSession } from '../../auth/session-manager.js'
import { extractExpenseFromImage } from '../../ocr/image-processor.js'
import { messages } from '../../localization/pt-br.js'
import { logger } from '../../services/monitoring/logger.js'
import { recordParsingMetric } from '../../services/monitoring/metrics-tracker.js'
import { parseWithAI, getUserContext } from '../../services/ai/ai-pattern-generator.js'
import { getOrCreateSession } from './helpers.js'
import { executeIntent } from './intent-executor.js'

export async function handleImageMessage(
  whatsappNumber: string, 
  imageBuffer: Buffer, 
  caption?: string,
  groupOwnerId?: string | null
): Promise<string | string[]> {
  logger.info('Handling image message', {
    whatsappNumber,
    hasCaption: !!caption,
    caption,
    imageSize: imageBuffer.length,
    groupOwnerId,
    isGroupMessage: !!groupOwnerId
  })
  
  const startTime = Date.now()
  
  // Check authentication (use group owner if in authorized group, otherwise check individual)
  let session = null
  if (groupOwnerId) {
    // For authorized groups, create/get session using group owner's user_id
    logger.info('Processing image from authorized group', { 
      groupOwnerId, 
      whatsappNumber,
      caption 
    })
    session = await getUserSession(whatsappNumber)
    if (!session) {
      logger.info('Creating session for group member', { 
        whatsappNumber, 
        groupOwnerId 
      })
      // Create session for this WhatsApp number linked to group owner
      await createUserSession(whatsappNumber, groupOwnerId)
      session = await getUserSession(whatsappNumber)
    }
    logger.info('Session established for group message', { 
      whatsappNumber, 
      userId: session?.userId 
    })
  } else {
    // For DMs, use normal authentication
    logger.info('Processing image from direct message', { whatsappNumber })
    session = await getOrCreateSession(whatsappNumber)
    logger.info('Session for DM', { 
      whatsappNumber, 
      userId: session?.userId,
      hasSession: !!session
    })
  }
  
  if (!session) {
    logger.warn('No session found for image message', { 
      whatsappNumber,
      groupOwnerId 
    })
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

  logger.info('Session confirmed, updating user activity', { 
    whatsappNumber, 
    userId: session.userId 
  })
  await updateUserActivity(whatsappNumber)

  try {
    // Process image with OCR
    logger.info('Starting OCR extraction from image', { 
      whatsappNumber, 
      userId: session.userId,
      imageSize: imageBuffer.length 
    })
    const expenses = await extractExpenseFromImage(imageBuffer, session.userId)
    
    logger.info('OCR extraction completed', { 
      whatsappNumber, 
      userId: session.userId,
      expenseCount: expenses?.length || 0,
      expenses: expenses?.map(e => ({
        amount: e.amount,
        category: e.category,
        description: e.description,
        type: e.type,
        date: e.date,
        paymentMethod: e.paymentMethod
      }))
    })

    if (!expenses || expenses.length === 0) {
      logger.warn('No expenses found in image', { 
        whatsappNumber, 
        userId: session.userId,
        ocrProcessingTime: Date.now() - startTime 
      })
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

    // Use AI to refine categories for OCR-extracted expenses
    logger.info('Fetching user context for AI classification', { userId: session.userId })
    const userContext = await getUserContext(session.userId)
    logger.info('User context retrieved', {
      userId: session.userId,
      availableCategories: userContext.recentCategories,
      categoryCount: userContext.recentCategories.length
    })
    
    // Handle multiple transactions from image
    if (expenses.length > 1) {
      logger.info('Processing multiple transactions from image with AI', {
        whatsappNumber,
        userId: session.userId,
        transactionCount: expenses.length
      })
      
      const transactions = []
      
      for (let i = 0; i < expenses.length; i++) {
        const expense = expenses[i]
        // Build a message describing the transaction for AI to classify
        const transactionMessage = `Gastei ${expense.amount} em ${expense.description || 'compra'}`
        
        logger.info(`Processing transaction ${i + 1}/${expenses.length} with AI`, {
          whatsappNumber,
          userId: session.userId,
          transactionIndex: i,
          messageForAI: transactionMessage,
          ocrCategory: expense.category,
          ocrDescription: expense.description
        })
        
        try {
          // Use AI to get better category based on description and user's custom categories
          const aiResult = await parseWithAI(transactionMessage, userContext)
          
          logger.info(`AI classification completed for transaction ${i + 1}`, {
            whatsappNumber,
            userId: session.userId,
            transactionIndex: i,
            aiAction: aiResult.action,
            aiCategory: aiResult.entities.category,
            aiDescription: aiResult.entities.description,
            aiConfidence: aiResult.confidence,
            ocrCategory: expense.category
          })
          
          transactions.push({
            amount: expense.amount,
            category: aiResult.entities.category || expense.category,
            description: aiResult.entities.description || expense.description,
            type: expense.type || 'expense',
            date: expense.date,
            paymentMethod: expense.paymentMethod,
          })
        } catch (aiError) {
          logger.warn('AI parsing failed for OCR transaction, using OCR category', { 
            whatsappNumber,
            userId: session.userId,
            transactionIndex: i,
            description: expense.description,
            ocrCategory: expense.category,
            error: aiError 
          })
          // Fall back to OCR category if AI fails
          transactions.push({
            amount: expense.amount,
            category: expense.category,
            description: expense.description,
            type: expense.type,
            date: expense.date,
            paymentMethod: expense.paymentMethod,
          })
        }
      }
      
      logger.info('All multiple transactions processed', {
        whatsappNumber,
        userId: session.userId,
        totalTransactions: transactions.length,
        transactions: transactions.map(t => ({ 
          amount: t.amount, 
          category: t.category, 
          description: t.description 
        }))
      })

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
        strategyUsed: 'ai_pattern',
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

    // Single transaction - use AI to refine category
    const expense = expenses[0]
    
    logger.info('Processing single transaction from image with AI', {
      whatsappNumber,
      userId: session.userId,
      ocrData: {
        amount: expense.amount,
        category: expense.category,
        description: expense.description,
        type: expense.type,
        date: expense.date,
        paymentMethod: expense.paymentMethod
      }
    })
    
    // Build a message for AI classification
    let messageForAI = `Gastei ${expense.amount} em ${expense.description || 'compra'}`
    if (caption) {
      messageForAI = `${messageForAI}. ${caption}`
    }
    
    logger.info('Constructed message for AI classification', {
      whatsappNumber,
      userId: session.userId,
      messageForAI,
      hasCaption: !!caption
    })
    
    try {
      // Use AI to get better category classification
      logger.info('Calling AI for category classification', {
        whatsappNumber,
        userId: session.userId,
        messageForAI
      })
      const aiResult = await parseWithAI(messageForAI, userContext)
      
      logger.info('AI classification result', {
        whatsappNumber,
        userId: session.userId,
        aiResult: {
          action: aiResult.action,
          confidence: aiResult.confidence,
          category: aiResult.entities.category,
          description: aiResult.entities.description,
          date: aiResult.entities.date,
          paymentMethod: aiResult.entities.paymentMethod
        },
        ocrCategory: expense.category,
        willUseCategory: aiResult.entities.category || expense.category
      })
      
      const action = aiResult.action === 'add_income' ? 'add_income' as const : 'add_expense' as const
      const intent = {
        action,
        confidence: aiResult.confidence || 0.8,
        entities: {
          amount: expense.amount,
          category: aiResult.entities.category || expense.category,
          description: aiResult.entities.description || expense.description,
          type: expense.type,
          date: aiResult.entities.date || expense.date,
          paymentMethod: aiResult.entities.paymentMethod || expense.paymentMethod,
        }
      }
      
      logger.info('Final intent for single transaction', {
        whatsappNumber,
        userId: session.userId,
        intent: {
          action: intent.action,
          confidence: intent.confidence,
          entities: intent.entities
        }
      })

      const result = await executeIntent(whatsappNumber, intent, session)
      
      await recordParsingMetric({
        userId: session.userId,
        whatsappNumber,
        messageText: caption || '[image]',
        messageType: 'image',
        strategyUsed: 'ai_pattern',
        intentAction: intent.action,
        confidence: intent.confidence,
        success: true,
        parseDurationMs: Date.now() - startTime
      })
      
      return `${messages.ocrSuccess(1)}\n\n${result}`
    } catch (aiError) {
      logger.warn('AI parsing failed for OCR transaction, falling back to OCR data', { 
        whatsappNumber,
        userId: session.userId,
        messageForAI,
        error: aiError 
      })
      
      // Fall back to OCR data if AI fails
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
      
      logger.info('Using fallback intent with OCR data', {
        whatsappNumber,
        userId: session.userId,
        intent: {
          action: intent.action,
          confidence: intent.confidence,
          entities: intent.entities
        }
      })

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
    }
  } catch (error) {
    logger.error('Critical error processing image', { 
      whatsappNumber, 
      userId: session.userId,
      imageSize: imageBuffer.length,
      hasCaption: !!caption,
      caption,
      totalProcessingTime: Date.now() - startTime,
      errorMessage: (error as Error).message,
      errorStack: (error as Error).stack
    }, error as Error)
    
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
