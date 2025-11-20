/**
 * Text Message Handler
 * 3-layer parsing: Explicit Commands → Cache → LLM
 */

import { parseIntent, getCommandHelp } from '../../nlp/intent-parser.js'
import { getUserSession, updateUserActivity, createUserSession } from '../../auth/session-manager.js'
import { handleLogin } from '../auth/auth.js'
import { messages } from '../../localization/pt-br.js'
import { hasPendingTransaction, handleDuplicateConfirmation, isDuplicateReply, extractDuplicateIdFromQuote } from '../transactions/duplicate-confirmation.js'
import { hasPendingOcrTransactions, handleOcrConfirmation, handleOcrCancel, handleOcrEdit, applyOcrEdit } from '../transactions/ocr-confirmation.js'
import { checkAuthorization, hasPermission } from '../../middleware/authorization.js'
import { logger } from '../../services/monitoring/logger.js'
import { recordParsingMetric, ParsingStrategy } from '../../services/monitoring/metrics-tracker.js'
import { parseWithAI, getUserContext } from '../../services/ai/ai-pattern-generator.js'
import { checkCacheWithDetails, saveToCache } from '../../services/ai/semantic-cache.js'
import { checkDailyLimit } from '../../services/ai/ai-usage-tracker.js'
import { isTransactionReply, extractTransactionIdFromQuote, injectTransactionIdContext } from '../../services/groups/transaction-id-extractor.js'
import { getOrCreateSession } from './helpers.js'
import { ACTION_PERMISSION_MAP, getActionDescription } from './permissions.js'
import { executeIntent } from './intent-executor.js'
import { setUserOcrPreference, getUserPreferences } from '../../services/user/preference-manager.js'
import { trackEvent } from '../../analytics/index.js'
import { WhatsAppAnalyticsEvent, WhatsAppAnalyticsProperty } from '../../analytics/events.js'

export async function handleTextMessage(
  whatsappNumber: string,
  message: string,
  quotedMessage?: string,
  groupOwnerId?: string | null
): Promise<string | string[]> {
  const startTime = Date.now()
  let strategy: ParsingStrategy = 'unknown'
  let session: any = null
  
  try {
    // LAYER 0.5: Reply Context Extraction (MOVED BEFORE STATE CHECKS)
    // If user is replying to a bot message with a transaction ID or duplicate ID, extract it
    // This allows users to edit/confirm specific transactions even when they have pending operations
    let enhancedMessage = message
    let replyTransactionId: string | null = null
    let replyDuplicateId: string | null = null

    if (quotedMessage) {
      // Check for transaction ID (for edits)
      if (isTransactionReply(quotedMessage)) {
        replyTransactionId = extractTransactionIdFromQuote(quotedMessage)
        if (replyTransactionId) {
          enhancedMessage = injectTransactionIdContext(message, replyTransactionId)
          logger.info('Reply to transaction detected - bypassing state checks', {
            whatsappNumber,
            transactionId: replyTransactionId,
            originalMessage: message
          })
        }
      }

      // Check for duplicate ID (for confirmations)
      if (isDuplicateReply(quotedMessage)) {
        replyDuplicateId = extractDuplicateIdFromQuote(quotedMessage)
        if (replyDuplicateId) {
          logger.info('Reply to duplicate detected', {
            whatsappNumber,
            duplicateId: replyDuplicateId,
            originalMessage: message
          })
        }
      }
    }

    // LAYER 0: State checks (OCR confirmation, duplicate confirmation)
    // Skip OCR/duplicate checks based on what user is replying to:
    // - Replying to transaction: Skip both OCR and duplicate checks
    // - Replying to duplicate: Skip OCR check only, handle specific duplicate
    // - No reply: Check both normally

    if (!replyTransactionId && !replyDuplicateId) {
      // No reply context - check OCR first
      if (hasPendingOcrTransactions(whatsappNumber)) {
        strategy = 'ocr_confirmation'
        logger.info('User has pending OCR transactions', { whatsappNumber, message })

        const messageLower = message.toLowerCase().trim()
        let result: string | string[]

        // Handle different responses
        if (messageLower === 'sim' || messageLower === 'confirmar' || messageLower === 'ok' || messageLower === 'yes') {
          logger.info('User confirmed OCR transactions', { whatsappNumber })
          result = await handleOcrConfirmation(whatsappNumber)
        } else if (messageLower === 'não' || messageLower === 'nao' || messageLower === 'cancelar' || messageLower === 'no') {
          logger.info('User cancelled OCR transactions', { whatsappNumber })
          result = await handleOcrCancel(whatsappNumber)
        } else if (messageLower.startsWith('editar ')) {
          // Extract transaction number: "editar 2"
          const parts = message.split(' ')
          const transactionNum = parseInt(parts[1], 10)

          if (isNaN(transactionNum)) {
            result = messages.ocrInvalidTransactionNumber(99) // Max will be checked in handler
          } else {
            logger.info('User requested OCR transaction edit', { whatsappNumber, transactionNum })
            result = await handleOcrEdit(whatsappNumber, transactionNum)
          }
        } else if (messageLower.includes(':')) {
          // Handle edit field updates: "categoria: Alimentação" or "valor: 50"
          const colonIndex = message.indexOf(':')
          const field = message.substring(0, colonIndex).trim().toLowerCase()
          const value = message.substring(colonIndex + 1).trim()

          logger.info('User providing OCR edit value', { whatsappNumber, field, value })

          // For now, show help message - full edit implementation can be added later
          result = '✏️ Para editar, use:\n• "sim" - Confirmar todas\n• "editar 2" - Editar transação #2\n• "cancelar" - Cancelar'
        } else {
          // Unknown response - show help
          result = messages.ocrConfirmationPrompt
        }

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

      // Check for duplicate confirmation (without reply context)
      if (hasPendingTransaction(whatsappNumber)) {
        strategy = 'duplicate_confirmation'
        logger.info('Using duplicate confirmation strategy (no specific ID)', { whatsappNumber })
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
    } else if (replyDuplicateId) {
      // User replied to a specific duplicate warning - handle that specific duplicate only
      // Skip OCR check since they're replying to a duplicate, not OCR pending transactions
      strategy = 'duplicate_confirmation'
      logger.info('Handling specific duplicate confirmation via reply', {
        whatsappNumber,
        duplicateId: replyDuplicateId
      })
      const result = await handleDuplicateConfirmation(whatsappNumber, message, replyDuplicateId)

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

        // Track Layer 1 match (explicit command)
        const tempSession = await getUserSession(whatsappNumber)
        if (tempSession) {
          trackEvent(
            WhatsAppAnalyticsEvent.NLP_LAYER_1_MATCH,
            tempSession.userId,
            {
              [WhatsAppAnalyticsProperty.INTENT_LAYER]: '1_explicit',
              [WhatsAppAnalyticsProperty.INTENT_TYPE]: commandResult.action,
              [WhatsAppAnalyticsProperty.INTENT_CONFIDENCE]: commandResult.confidence,
            }
          )
        }
        
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
            ? await getCommandHelp(commandResult.entities.description)
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

        // Handle settings command (requires authentication but no permissions check)
        if (message.toLowerCase().startsWith('/settings') || message.toLowerCase().startsWith('/config')) {
          // Get or create session
          if (groupOwnerId) {
            session = await getUserSession(whatsappNumber)
            if (!session) {
              await createUserSession(whatsappNumber, groupOwnerId)
              session = await getUserSession(whatsappNumber)
            }
          } else {
            session = await getOrCreateSession(whatsappNumber)
          }

          if (!session) {
            await recordParsingMetric({
              whatsappNumber,
              messageText: message,
              messageType: 'text',
              strategyUsed: strategy,
              success: false,
              errorMessage: 'Authentication required'
            })
            return messages.loginPrompt
          }

          await updateUserActivity(whatsappNumber)

          // Parse settings command: /settings ocr [auto|confirm]
          const parts = message.toLowerCase().split(/\s+/)

          if (parts.length === 1) {
            // Show current settings
            const preferences = await getUserPreferences(session.userId)
            const result = messages.ocrSettingCurrent(preferences.ocrAutoAdd)

            await recordParsingMetric({
              whatsappNumber,
              userId: session.userId,
              messageText: message,
              messageType: 'text',
              strategyUsed: strategy,
              success: true,
              parseDurationMs: Date.now() - startTime
            })

            return result
          }

          if (parts[1] === 'ocr') {
            if (parts.length === 2) {
              // Show current OCR setting
              const preferences = await getUserPreferences(session.userId)
              const result = messages.ocrSettingCurrent(preferences.ocrAutoAdd)

              await recordParsingMetric({
                whatsappNumber,
                userId: session.userId,
                messageText: message,
                messageType: 'text',
                strategyUsed: strategy,
                success: true,
                parseDurationMs: Date.now() - startTime
              })

              return result
            }

            const value = parts[2]
            if (value === 'auto' || value === 'automatico') {
              await setUserOcrPreference(session.userId, true)
              const result = messages.ocrSettingUpdated(true)

              await recordParsingMetric({
                whatsappNumber,
                userId: session.userId,
                messageText: message,
                messageType: 'text',
                strategyUsed: strategy,
                success: true,
                parseDurationMs: Date.now() - startTime
              })

              return result
            } else if (value === 'confirm' || value === 'confirmar') {
              await setUserOcrPreference(session.userId, false)
              const result = messages.ocrSettingUpdated(false)

              await recordParsingMetric({
                whatsappNumber,
                userId: session.userId,
                messageText: message,
                messageType: 'text',
                strategyUsed: strategy,
                success: true,
                parseDurationMs: Date.now() - startTime
              })

              return result
            } else {
              const result = '❌ Opção inválida. Use: /settings ocr [auto|confirmar]'

              await recordParsingMetric({
                whatsappNumber,
                userId: session.userId,
                messageText: message,
                messageType: 'text',
                strategyUsed: strategy,
                success: false,
                errorMessage: 'Invalid setting value'
              })

              return result
            }
          }

          // Unknown setting
          const result = '❌ Configuração desconhecida. Use: /settings ocr [auto|confirmar]'

          await recordParsingMetric({
            whatsappNumber,
            userId: session.userId,
            messageText: message,
            messageType: 'text',
            strategyUsed: strategy,
            success: false,
            errorMessage: 'Unknown setting'
          })

          return result
        }

        // Check authentication for other commands
        if (groupOwnerId) {
          // For authorized groups, use group owner's account
          logger.info('Using group owner account for command', { groupOwnerId, whatsappNumber })
          session = await getUserSession(whatsappNumber)
          if (!session) {
            await createUserSession(whatsappNumber, groupOwnerId)
            session = await getUserSession(whatsappNumber)
          }
        } else {
          // For DMs, use normal authentication
          session = await getOrCreateSession(whatsappNumber)
        }
        
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
        
        // Record parsing metric BEFORE execution to get the ID
        const parsingMetricId = await recordParsingMetric({
          whatsappNumber,
          userId: session.userId,
          messageText: message,
          messageType: 'text',
          strategyUsed: strategy,
          intentAction: commandResult.action,
          confidence: commandResult.confidence,
          success: true,
          parseDurationMs: Date.now() - startTime,
          intentEntities: commandResult.entities
        })

        const result = await executeIntent(whatsappNumber, commandResult, session, parsingMetricId)

        return result
      }
    }

    // Check authentication for natural language (required for cache and LLM)
    if (groupOwnerId) {
      // For authorized groups, use group owner's account
      logger.info('Using group owner account for NLP', { groupOwnerId, whatsappNumber })
      session = await getUserSession(whatsappNumber)
      if (!session) {
        await createUserSession(whatsappNumber, groupOwnerId)
        session = await getUserSession(whatsappNumber)
      }
    } else {
      // For DMs, use normal authentication
      session = await getOrCreateSession(whatsappNumber)
    }
    
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
    const cacheResult = await checkCacheWithDetails(session.userId, enhancedMessage)

    if (cacheResult.hit && cacheResult.intent && cacheResult.intent.action !== 'unknown') {
      const cachedIntent = cacheResult.intent

      logger.info('Cache hit!', {
        whatsappNumber,
        userId: session.userId,
        action: cachedIntent.action,
        confidence: cachedIntent.confidence,
        similarity: cacheResult.similarity
      })

      // Track Layer 2 hit (semantic cache)
      trackEvent(
        WhatsAppAnalyticsEvent.NLP_LAYER_2_HIT,
        session.userId,
        {
          [WhatsAppAnalyticsProperty.INTENT_LAYER]: '2_semantic_cache',
          [WhatsAppAnalyticsProperty.INTENT_TYPE]: cachedIntent.action,
          [WhatsAppAnalyticsProperty.INTENT_CONFIDENCE]: cachedIntent.confidence,
          [WhatsAppAnalyticsProperty.CACHE_HIT]: true,
          [WhatsAppAnalyticsProperty.SIMILARITY_SCORE]: cacheResult.similarity,
        }
      )

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
            errorMessage: 'Permission denied',
            cacheHit: true,
            cacheSimilarity: cacheResult.similarity,
            intentEntities: cachedIntent.entities
          })

          return messages.permissionDenied(actionDesc)
        }
      }

      // Record parsing metric BEFORE execution to get the ID
      const parsingMetricId = await recordParsingMetric({
        whatsappNumber,
        userId: session.userId,
        messageText: message,
        messageType: 'text',
        strategyUsed: strategy,
        intentAction: cachedIntent.action,
        confidence: cachedIntent.confidence,
        success: true,
        parseDurationMs: Date.now() - startTime,
        cacheHit: true,
        cacheSimilarity: cacheResult.similarity,
        intentEntities: cachedIntent.entities
      })

      const result = await executeIntent(whatsappNumber, cachedIntent, session, parsingMetricId)

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
      const llmStartTime = Date.now()
      const aiResult = await parseWithAI(enhancedMessage, userContext, quotedMessage)
      const llmDuration = Date.now() - llmStartTime

      logger.info('LLM result', {
        whatsappNumber,
        userId: session.userId,
        action: aiResult.action,
        confidence: aiResult.confidence,
        parseDurationMs: Date.now() - startTime
      })

      // Track Layer 3 call (OpenAI LLM)
      trackEvent(
        WhatsAppAnalyticsEvent.NLP_LAYER_3_CALL,
        session.userId,
        {
          [WhatsAppAnalyticsProperty.INTENT_LAYER]: '3_llm',
          [WhatsAppAnalyticsProperty.INTENT_TYPE]: aiResult.action,
          [WhatsAppAnalyticsProperty.INTENT_CONFIDENCE]: aiResult.confidence,
          [WhatsAppAnalyticsProperty.PROCESSING_TIME_MS]: llmDuration,
          [WhatsAppAnalyticsProperty.OPENAI_MODEL]: 'gpt-4o-mini',
        }
      )
      
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
      
      // Record parsing metric BEFORE execution to get the ID
      const parsingMetricId = await recordParsingMetric({
        whatsappNumber,
        userId: session.userId,
        messageText: message,
        messageType: 'text',
        strategyUsed: strategy,
        intentAction: aiResult.action,
        confidence: aiResult.confidence,
        success: true,
        parseDurationMs: Date.now() - startTime,
        cacheHit: false,
        intentEntities: aiResult.entities
      })

      // Track successful intent parsing
      trackEvent(
        WhatsAppAnalyticsEvent.NLP_INTENT_PARSED,
        session.userId,
        {
          [WhatsAppAnalyticsProperty.INTENT_TYPE]: aiResult.action,
          [WhatsAppAnalyticsProperty.INTENT_CONFIDENCE]: aiResult.confidence,
          [WhatsAppAnalyticsProperty.INTENT_LAYER]: strategy === 'ai_function_calling' ? '3_llm' : strategy === 'semantic_cache' ? '2_semantic_cache' : '1_explicit',
          [WhatsAppAnalyticsProperty.PROCESSING_TIME_MS]: Date.now() - startTime,
        }
      )

      // Execute the intent
      let result = await executeIntent(whatsappNumber, aiResult, session, parsingMetricId)

      // Save to cache for future use (async, don't wait)
      saveToCache(session.userId, message, aiResult)

      return result
    } catch (error) {
      logger.error('LLM parsing failed', {
        whatsappNumber,
        userId: session.userId
      }, error as Error)

      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'

      // Track NLP intent parsing failure
      trackEvent(
        WhatsAppAnalyticsEvent.NLP_INTENT_FAILED,
        session.userId,
        {
          [WhatsAppAnalyticsProperty.INTENT_LAYER]: '3_llm',
          [WhatsAppAnalyticsProperty.ERROR_TYPE]: errorMessage.includes('limit exceeded') ? 'daily_limit_exceeded' : 'llm_error',
          [WhatsAppAnalyticsProperty.ERROR_MESSAGE]: errorMessage,
          [WhatsAppAnalyticsProperty.PROCESSING_TIME_MS]: Date.now() - startTime,
        }
      )

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
