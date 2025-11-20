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
import { storePendingOcrTransactions } from '../transactions/ocr-confirmation.js'
import { getUserOcrPreference } from '../../services/user/preference-manager.js'
import { trackEvent } from '../../analytics/index.js'
import { WhatsAppAnalyticsEvent, WhatsAppAnalyticsProperty } from '../../analytics/events.js'

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

  // Track OCR image received
  trackEvent(
    WhatsAppAnalyticsEvent.OCR_IMAGE_RECEIVED,
    session.userId,
    {
      [WhatsAppAnalyticsProperty.IMAGE_SIZE_KB]: Math.round(imageBuffer.length / 1024),
      [WhatsAppAnalyticsProperty.IS_GROUP_MESSAGE]: !!groupOwnerId,
    }
  )

  try {
    // Process image with OCR
    logger.info('Starting OCR extraction from image', {
      whatsappNumber,
      userId: session.userId,
      imageSize: imageBuffer.length
    })

    // Track OCR extraction started
    trackEvent(
      WhatsAppAnalyticsEvent.OCR_EXTRACTION_STARTED,
      session.userId,
      {
        [WhatsAppAnalyticsProperty.IMAGE_SIZE_KB]: Math.round(imageBuffer.length / 1024),
      }
    )

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
      // Track OCR failure (no data extracted)
      trackEvent(
        WhatsAppAnalyticsEvent.OCR_EXTRACTION_FAILED,
        session.userId,
        {
          [WhatsAppAnalyticsProperty.ERROR_TYPE]: 'no_data_extracted',
          [WhatsAppAnalyticsProperty.PROCESSING_TIME_MS]: Date.now() - startTime,
        }
      )

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

    // Track successful OCR extraction
    trackEvent(
      WhatsAppAnalyticsEvent.OCR_EXTRACTION_COMPLETED,
      session.userId,
      {
        [WhatsAppAnalyticsProperty.EXTRACTION_COUNT]: expenses.length,
        [WhatsAppAnalyticsProperty.PROCESSING_TIME_MS]: Date.now() - startTime,
        [WhatsAppAnalyticsProperty.OCR_ENGINE]: 'tesseract',
      }
    )

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
      logger.info('OCR extracted multiple transactions', {
        whatsappNumber,
        userId: session.userId,
        transactionCount: expenses.length
      })

      // Prepare transactions for confirmation
      const transactions = expenses.map((expense, i) => {
        logger.info(`Preparing OCR transaction ${i + 1}/${expenses.length}`, {
          whatsappNumber,
          userId: session.userId,
          transactionIndex: i,
          type: expense.type,
          category: expense.category,
          description: expense.description,
          amount: expense.amount
        })

        return {
          amount: expense.amount,
          category: expense.category,
          description: expense.description,
          type: expense.type,
          date: expense.date,
          paymentMethod: expense.paymentMethod,
        }
      })

      // Check user preference for OCR behavior
      const autoAdd = await getUserOcrPreference(session.userId)
      logger.info('Checked OCR preference for multiple transactions', {
        whatsappNumber,
        userId: session.userId,
        autoAdd
      })

      // Record parsing metric for analytics (without linking to transactions yet)
      const parsingMetricId = await recordParsingMetric({
        userId: session.userId,
        whatsappNumber,
        messageText: caption || '[image]',
        messageType: 'image',
        strategyUsed: 'ai_pattern',
        intentAction: 'add_expense',
        confidence: 0.95,
        success: true,
        parseDurationMs: Date.now() - startTime,
        intentEntities: { transactions }
      })

      if (autoAdd) {
        // AUTO-ADD MODE: Add all transactions immediately (legacy behavior)
        logger.info('Auto-adding OCR transactions (user preference)', {
          whatsappNumber,
          userId: session.userId,
          transactionCount: transactions.length
        })

        const results: string[] = []
        let successCount = 0

        for (let i = 0; i < transactions.length; i++) {
          const transaction = transactions[i]
          try {
            const action = transaction.type === 'income' ? 'add_income' as const : 'add_expense' as const
            const intent = {
              action,
              confidence: 0.95,
              entities: transaction,
            }

            const result = await executeIntent(whatsappNumber, intent, session, parsingMetricId)
            results.push(`${i + 1}/${transactions.length} - ${result}`)
            successCount++
          } catch (error) {
            logger.error('Error auto-adding OCR transaction', {
              whatsappNumber,
              index: i,
              description: transaction.description,
            }, error as Error)
            results.push(`${i + 1}/${transactions.length} - ❌ Erro: ${transaction.description}`)
          }
        }

        results.push(messages.ocrAllAdded(transactions.length, successCount))
        return results
      } else {
        // CONFIRM MODE: Store for user confirmation (default behavior)
        storePendingOcrTransactions(whatsappNumber, session.userId, transactions, parsingMetricId)

        logger.info('OCR transactions stored, awaiting user confirmation', {
          whatsappNumber,
          userId: session.userId,
          transactionCount: transactions.length,
          parsingMetricId
        })

        // Show preview and ask for confirmation
        return messages.ocrPreview(transactions)
      }
    }

    // Single transaction - prepare for confirmation
    const expense = expenses[0]

    logger.info('OCR extracted single transaction', {
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

    // Optionally enhance with AI if caption provided
    let finalTransaction = {
      amount: expense.amount,
      category: expense.category,
      description: expense.description,
      type: expense.type,
      date: expense.date,
      paymentMethod: expense.paymentMethod,
    }

    if (caption) {
      try {
        // Build a message for AI classification with caption context
        const verb = expense.type === 'income' ? 'Recebi' : 'Gastei'
        const messageForAI = `${verb} ${expense.amount} ${expense.type === 'income' ? 'de' : 'em'} ${expense.description || 'transação'}. ${caption}`

        logger.info('Caption provided - calling AI for enhanced classification', {
          whatsappNumber,
          userId: session.userId,
          messageForAI,
          caption
        })

        const aiResult = await parseWithAI(messageForAI, userContext)

        if (aiResult) {
          // Enhance transaction with AI results
          finalTransaction = {
            ...finalTransaction,
            category: aiResult.entities.category || finalTransaction.category,
            description: aiResult.entities.description || finalTransaction.description,
            date: aiResult.entities.date || finalTransaction.date,
            paymentMethod: aiResult.entities.paymentMethod || finalTransaction.paymentMethod,
          }

          logger.info('AI enhanced single transaction', {
            whatsappNumber,
            userId: session.userId,
            enhanced: finalTransaction
          })
        }
      } catch (error) {
        logger.warn('AI enhancement failed, using OCR data', {
          whatsappNumber,
          userId: session.userId,
          error
        })
      }
    }

    // Check user preference for OCR behavior
    const autoAdd = await getUserOcrPreference(session.userId)
    logger.info('Checked OCR preference for single transaction', {
      whatsappNumber,
      userId: session.userId,
      autoAdd
    })

    // Record parsing metric for analytics
    const parsingMetricId = await recordParsingMetric({
      userId: session.userId,
      whatsappNumber,
      messageText: caption || '[image]',
      messageType: 'image',
      strategyUsed: 'ai_pattern',
      intentAction: 'add_expense',
      confidence: 0.95,
      success: true,
      parseDurationMs: Date.now() - startTime,
      intentEntities: finalTransaction
    })

    if (autoAdd) {
      // AUTO-ADD MODE: Add transaction immediately (legacy behavior)
      logger.info('Auto-adding single OCR transaction (user preference)', {
        whatsappNumber,
        userId: session.userId
      })

      const action = finalTransaction.type === 'income' ? 'add_income' as const : 'add_expense' as const
      const intent = {
        action,
        confidence: 0.95,
        entities: finalTransaction,
      }

      const result = await executeIntent(whatsappNumber, intent, session, parsingMetricId)
      return result
    } else {
      // CONFIRM MODE: Store for user confirmation (default behavior)
      storePendingOcrTransactions(whatsappNumber, session.userId, [finalTransaction], parsingMetricId)

      logger.info('Single OCR transaction stored, awaiting user confirmation', {
        whatsappNumber,
        userId: session.userId,
        parsingMetricId
      })

      // Show preview and ask for confirmation
      return messages.ocrPreview([finalTransaction])
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
