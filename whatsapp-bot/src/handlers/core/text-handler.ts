/**
 * Text Message Handler
 * 3-layer parsing: Explicit Commands → Cache → LLM
 */

import { parseIntent, getCommandHelp } from '../../nlp/intent-parser.js'
import { getUserSession, updateUserActivity, createUserSession } from '../../auth/session-manager.js'
import { handleLogin } from '../auth/auth.js'
import { messages } from '../../localization/pt-br.js'
import { hasPendingTransaction, handleDuplicateConfirmation } from '../transactions/duplicate-confirmation.js'
import { checkAuthorization, hasPermission } from '../../middleware/authorization.js'
import { logger } from '../../services/monitoring/logger.js'
import { recordParsingMetric, ParsingStrategy } from '../../services/monitoring/metrics-tracker.js'
import { parseWithAI, getUserContext } from '../../services/ai/ai-pattern-generator.js'
import { checkCache, saveToCache } from '../../services/ai/semantic-cache.js'
import { checkDailyLimit } from '../../services/ai/ai-usage-tracker.js'
import { isTransactionReply, extractTransactionIdFromQuote, injectTransactionIdContext } from '../../services/groups/transaction-id-extractor.js'
import { getOrCreateSession } from './helpers.js'
import { ACTION_PERMISSION_MAP, getActionDescription } from './permissions.js'
import { executeIntent } from './intent-executor.js'

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
