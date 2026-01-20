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
import { hasPendingTransactionContext } from '../../services/conversation/pending-transaction-state.js'
import { hasPendingInstallmentContext } from '../../services/conversation/pending-installment-state.js'
import { hasPendingPayoff } from '../../services/conversation/pending-payoff-state.js'
import { handleModeSelection } from '../credit-card/mode-selection.js'
import { handleCardSelection } from '../credit-card/installment-handler.js'
import { handlePayoffRequest } from '../credit-card/installment-payoff-handler.js'
import { handleModeSwitchWarningResponse, handleModeSwitchCardSelection } from '../credit-card/mode-switch.js'
import { getConversationState } from '../../services/conversation/state-manager.js'
import { getUserLocale } from '../../localization/i18n.js'
import { checkAuthorization, checkAuthorizationWithIdentifiers, hasPermission } from '../../middleware/authorization.js'
import type { UserIdentifiers } from '../../utils/user-identifiers.js'
import { logger } from '../../services/monitoring/logger.js'
import { recordParsingMetric, ParsingStrategy } from '../../services/monitoring/metrics-tracker.js'
import { parseWithAI, getUserContext } from '../../services/ai/ai-pattern-generator.js'
import { checkCacheWithDetails, saveToCache, type CacheResult } from '../../services/ai/semantic-cache.js'
import { checkDailyLimit } from '../../services/ai/ai-usage-tracker.js'
import { isTransactionReply, extractTransactionIdFromQuote, injectTransactionIdContext } from '../../services/groups/transaction-id-extractor.js'
import { getOrCreateSession } from './helpers.js'
import { ACTION_PERMISSION_MAP, getActionDescription } from './permissions.js'
import { executeIntent } from './intent-executor.js'
import { setUserOcrPreference, getUserPreferences } from '../../services/user/preference-manager.js'
import { trackEvent } from '../../analytics/index.js'
import { WhatsAppAnalyticsEvent, WhatsAppAnalyticsProperty } from '../../analytics/events.js'
import { checkAndRecordActivity, type MessageContext as EngagementMessageContext } from '../../services/engagement/activity-tracker.js'
import { handleFirstMessage, shouldTriggerWelcomeFlow, type FirstMessageHandlerContext } from '../engagement/first-message-handler.js'
import { autoDetectDestination } from '../../services/engagement/message-router.js'
import { messages as ptBrMessages } from '../../localization/pt-br.js'
import { messages as enMessages } from '../../localization/en.js'
import { isTipCommand, handleTipOptOut, parseOptOutCommand, handleOptOutCommand, type OptOutContext } from '../engagement/opt-out-handler.js'
import { checkAndHandleGoodbyeResponse } from '../engagement/goodbye-handler.js'
import { isDestinationSwitchCommand, handleDestinationSwitch, type DestinationSwitchContext } from '../engagement/destination-handler.js'

export async function handleTextMessage(
  whatsappNumber: string,
  message: string,
  quotedMessage?: string,
  groupOwnerId?: string | null,
  userIdentifiers?: UserIdentifiers
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

      // Check for credit mode selection (Story 1.3)
      if (hasPendingTransactionContext(whatsappNumber)) {
        strategy = 'credit_mode_selection'
        logger.info('User has pending credit mode selection', { whatsappNumber, message })

        // Get user session for mode selection
        session = await getOrCreateSession(whatsappNumber)

        if (!session) {
          logger.warn('Failed to get session for mode selection', { whatsappNumber })
          return messages.notAuthenticated
        }

        const result = await handleModeSelection(message, whatsappNumber, session.userId)

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

      // Check for installment card selection (Story 2.1 - AC1.2 Scenario 3)
      if (hasPendingInstallmentContext(whatsappNumber)) {
        strategy = 'installment_card_selection'
        logger.info('User has pending installment card selection', { whatsappNumber, message })

        const result = await handleCardSelection(whatsappNumber, message)

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

      // Check for payoff conversation (Story 2.5)
      if (hasPendingPayoff(whatsappNumber)) {
        strategy = 'payoff_conversation'
        logger.info('User has pending payoff conversation', { whatsappNumber, message })

        const result = await handlePayoffRequest(whatsappNumber, message)

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

      // Check for mode switch warning response (Story 1.5 - installment cleanup choice)
      session = session || await getOrCreateSession(whatsappNumber)
      if (session) {
        const modeSwitchConfirmState = await getConversationState(session.userId, 'mode_switch_confirm')
        if (modeSwitchConfirmState) {
          strategy = 'mode_switch_warning_response'
          logger.info('User has pending mode switch warning response', { whatsappNumber, message })

          const locale = await getUserLocale(session.userId)
          const result = await handleModeSwitchWarningResponse(session.userId, message, locale)

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

        // Check for mode switch card selection (Story 1.5 - multi-card selection)
        const modeSwitchSelectState = await getConversationState(session.userId, 'mode_switch_select')
        if (modeSwitchSelectState) {
          strategy = 'mode_switch_card_selection'
          logger.info('User has pending mode switch card selection', { whatsappNumber, message })

          const locale = await getUserLocale(session.userId)
          const result = await handleModeSwitchCardSelection(session.userId, message, locale)

          if (result) {
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
        }
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

    // LAYER 0.9: Tip Command Check (Story 3.5)
    // AC-3.5.1, AC-3.5.2: Handle "parar dicas"/"stop tips" and "ativar dicas"/"enable tips"
    // Must be checked BEFORE NLP processing but AFTER authentication
    if (isTipCommand(message)) {
      // Need authentication for tip preference update
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
        return messages.loginPrompt
      }

      // TODO: Detect user locale properly (for now default to pt-BR)
      const locale: 'pt-BR' | 'en' = 'pt-BR'
      const result = await handleTipOptOut(session.userId, message, locale)

      if (result) {
        strategy = 'tip_command'
        await recordParsingMetric({
          whatsappNumber,
          userId: session.userId,
          messageText: message,
          messageType: 'text',
          strategyUsed: strategy,
          success: true,
          parseDurationMs: Date.now() - startTime,
        })
        return result
      }
    }

    // LAYER 0.91: Re-engagement Opt-Out Command Check (Story 6.1)
    // AC-6.1.1, AC-6.1.2: Handle "parar lembretes"/"stop reminders" and "ativar lembretes"/"start reminders"
    // Must be checked at HIGHEST PRIORITY (before NLP) to ensure fast response (< 2s)
    const optOutIntent = parseOptOutCommand(message, 'pt-BR') // TODO: Detect user locale properly
    if (optOutIntent) {
      // Need authentication for preference update
      let optOutSession = session
      if (!optOutSession) {
        if (groupOwnerId) {
          optOutSession = await getUserSession(whatsappNumber)
          if (!optOutSession) {
            await createUserSession(whatsappNumber, groupOwnerId)
            optOutSession = await getUserSession(whatsappNumber)
          }
        } else {
          optOutSession = await getOrCreateSession(whatsappNumber)
        }
      }

      if (optOutSession) {
        // TODO: Detect user locale properly (for now default to pt-BR)
        const locale: 'pt-BR' | 'en' = 'pt-BR'
        const optOutContext: OptOutContext = {
          userId: optOutSession.userId,
          whatsappJid: whatsappNumber,
          command: optOutIntent,
          locale
        }

        const optOutResult = await handleOptOutCommand(optOutContext)

        if (optOutResult.success) {
          strategy = 'engagement_opt_out' as ParsingStrategy
          await recordParsingMetric({
            whatsappNumber,
            userId: optOutSession.userId,
            messageText: message,
            messageType: 'text',
            strategyUsed: strategy,
            success: true,
            parseDurationMs: Date.now() - startTime,
          })

          // Return localized confirmation message
          const userMessages = locale === 'pt-BR' ? ptBrMessages : enMessages
          const confirmationKey = optOutIntent === 'opt_out' ? 'engagementOptOutConfirmed' : 'engagementOptInConfirmed'
          return userMessages[confirmationKey]
        } else {
          // Failed to update preference, return error message
          strategy = 'engagement_opt_out' as ParsingStrategy
          await recordParsingMetric({
            whatsappNumber,
            userId: optOutSession.userId,
            messageText: message,
            messageType: 'text',
            strategyUsed: strategy,
            success: false,
            errorMessage: optOutResult.error || 'Failed to update preference',
            parseDurationMs: Date.now() - startTime,
          })
          return optOutResult.error || 'Failed to update preference'
        }
      }
      // If no session, continue to normal flow (will prompt for login)
      session = optOutSession
    }

    // LAYER 0.95: Goodbye Response Check (Story 4.4)
    // AC-4.4.1 to AC-4.4.4: Handle responses to goodbye message (1/2/3)
    // Must be checked BEFORE NLP processing but AFTER authentication
    // Checks if user is in goodbye_sent state and processes response accordingly
    {
      // Need authentication for goodbye response handling
      let goodbyeSession = session
      if (!goodbyeSession) {
        if (groupOwnerId) {
          goodbyeSession = await getUserSession(whatsappNumber)
          if (!goodbyeSession) {
            await createUserSession(whatsappNumber, groupOwnerId)
            goodbyeSession = await getUserSession(whatsappNumber)
          }
        } else {
          goodbyeSession = await getOrCreateSession(whatsappNumber)
        }
      }

      if (goodbyeSession) {
        // TODO: Detect user locale properly (for now default to pt-BR)
        const locale: 'pt-BR' | 'en' = 'pt-BR'
        const goodbyeResult = await checkAndHandleGoodbyeResponse(
          goodbyeSession.userId,
          message,
          locale
        )

        if (goodbyeResult) {
          // User was in goodbye_sent state and sent a valid goodbye response
          strategy = 'goodbye_response'
          await recordParsingMetric({
            whatsappNumber,
            userId: goodbyeSession.userId,
            messageText: message,
            messageType: 'text',
            strategyUsed: strategy,
            success: true,
            parseDurationMs: Date.now() - startTime,
          })
          return goodbyeResult
        }
        // If goodbyeResult is null:
        // - Either user is not in goodbye_sent state, or
        // - User sent a non-goodbye response and was transitioned to active
        // Either way, continue with normal processing
        session = goodbyeSession
      }
    }

    // LAYER 0.96: Destination Switch Command Check (Story 4.6)
    // AC-4.6.3, AC-4.6.4: Handle "mudar para grupo"/"switch to group" and "mudar para individual"/"switch to private"
    // Must be checked BEFORE NLP processing but AFTER authentication
    if (isDestinationSwitchCommand(message)) {
      // Need authentication for destination switch
      let destSession = session
      if (!destSession) {
        if (groupOwnerId) {
          destSession = await getUserSession(whatsappNumber)
          if (!destSession) {
            await createUserSession(whatsappNumber, groupOwnerId)
            destSession = await getUserSession(whatsappNumber)
          }
        } else {
          destSession = await getOrCreateSession(whatsappNumber)
        }
      }

      if (destSession) {
        // TODO: Detect user locale properly (for now default to pt-BR)
        const locale: 'pt-BR' | 'en' = 'pt-BR'
        const destContext: DestinationSwitchContext = {
          userId: destSession.userId,
          messageSource: groupOwnerId ? 'group' : 'individual',
          groupJid: groupOwnerId ? whatsappNumber : undefined, // In group context, whatsappNumber is the group JID
          locale,
        }

        const destResult = await handleDestinationSwitch(
          destSession.userId,
          message,
          destContext
        )

        if (destResult) {
          strategy = 'destination_switch' as ParsingStrategy
          await recordParsingMetric({
            whatsappNumber,
            userId: destSession.userId,
            messageText: message,
            messageType: 'text',
            strategyUsed: strategy,
            success: destResult.success,
            parseDurationMs: Date.now() - startTime,
          })
          return destResult.message
        }
        session = destSession
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
          // Use multi-identifier authorization if available, fallback to legacy
          const authResult = userIdentifiers
            ? await checkAuthorizationWithIdentifiers(userIdentifiers)
            : await checkAuthorization(whatsappNumber)
          
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

        // AC-2.5.3: Explicit commands do NOT trigger magic moment
        const result = await executeIntent(whatsappNumber, commandResult, session, parsingMetricId, false)

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

    // FIRST MESSAGE CHECK: Detect and handle first-time user messages (Story 2.2)
    // This triggers the conversational welcome flow for new users
    let firstMessageWelcome: string | null = null
    try {
      const engagementContext: EngagementMessageContext = {
        jid: whatsappNumber,
        isGroup: !!groupOwnerId,
        groupJid: undefined, // Group JID not available here
        pushName: userIdentifiers?.pushName ?? undefined, // Convert null to undefined
        messageText: message,
      }

      const activityResult = await checkAndRecordActivity(session.userId, engagementContext)

      if (shouldTriggerWelcomeFlow(activityResult)) {
        logger.info('First message detected - triggering welcome flow', {
          whatsappNumber,
          userId: session.userId,
          isGroup: engagementContext.isGroup,
        })

        // Story 2.4: Auto-detect preferred destination on first message
        const destinationJid = engagementContext.isGroup && engagementContext.groupJid
          ? engagementContext.groupJid
          : whatsappNumber
        await autoDetectDestination(
          session.userId,
          activityResult.preferredDestination,
          destinationJid
        )

        // TODO: Detect user locale properly (for now default to pt-BR)
        const userMessages = ptBrMessages

        const firstMessageContext: FirstMessageHandlerContext = {
          userId: session.userId,
          pushName: userIdentifiers?.pushName ?? undefined, // Convert null to undefined
          messageText: message,
          locale: 'pt-BR',
          activityResult,
        }

        const firstMessageResponse = await handleFirstMessage(firstMessageContext, {
          engagementFirstMessage: userMessages.engagementFirstMessage,
          engagementFirstExpenseSuccess: userMessages.engagementFirstExpenseSuccess,
          engagementGuideToFirstExpense: userMessages.engagementGuideToFirstExpense,
          engagementFirstExpenseCelebration: userMessages.engagementFirstExpenseCelebration,
        })

        if (firstMessageResponse.message) {
          if (firstMessageResponse.shouldProcessExpense) {
            // Message is an expense - store welcome to prepend to response
            firstMessageWelcome = firstMessageResponse.message
            logger.info('First message is expense - will prepend welcome to response', {
              userId: session.userId,
            })
          } else {
            // Message is not an expense - return welcome message directly
            logger.info('First message not parseable - returning welcome only', {
              userId: session.userId,
            })

            await recordParsingMetric({
              whatsappNumber,
              userId: session.userId,
              messageText: message,
              messageType: 'text',
              strategyUsed: 'first_message_welcome',
              success: true,
              parseDurationMs: Date.now() - startTime,
            })

            return firstMessageResponse.message
          }
        }
      }
    } catch (firstMessageError) {
      // Don't fail the entire flow if first message detection fails
      logger.error('First message detection failed, continuing with normal flow', {
        whatsappNumber,
        userId: session.userId,
      }, firstMessageError as Error)
    }

    // LAYER 2: Semantic Cache Lookup (low cost)
    // TODO: TEMPORARILY DISABLED - Re-enable when cache issues are resolved
    // strategy = 'semantic_cache'
    // const cacheResult = await checkCacheWithDetails(session.userId, enhancedMessage)
    const cacheResult: CacheResult = { hit: false } // Bypass cache - always miss

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
        // Use multi-identifier authorization if available, fallback to legacy
        const authResult = userIdentifiers
          ? await checkAuthorizationWithIdentifiers(userIdentifiers)
          : await checkAuthorization(whatsappNumber)

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

      // Story 2.5: Semantic cache hit is NLP-parsed (wasNlpParsed=true)
      const result = await executeIntent(whatsappNumber, cachedIntent, session, parsingMetricId, true)

      // Prepend first message welcome if this is the user's first interaction
      if (firstMessageWelcome) {
        logger.info('Prepending first message welcome to cache result', { userId: session.userId })
        const resultStr = Array.isArray(result) ? result.join('\n\n') : result
        return `${firstMessageWelcome}\n\n${resultStr}`
      }

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
          [WhatsAppAnalyticsProperty.OPENAI_MODEL]: 'gpt-5',
        }
      )
      
      // Check permissions
      const requiredPermission = ACTION_PERMISSION_MAP[aiResult.action]
      if (requiredPermission) {
        // Use multi-identifier authorization if available, fallback to legacy
        const authResult = userIdentifiers
          ? await checkAuthorizationWithIdentifiers(userIdentifiers)
          : await checkAuthorization(whatsappNumber)
        
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
      // Story 2.5: LLM parsed intent is NLP-parsed (wasNlpParsed=true)
      let result = await executeIntent(whatsappNumber, aiResult, session, parsingMetricId, true)

      // Save to cache for future use (async, don't wait)
      saveToCache(session.userId, message, aiResult)

      // Prepend first message welcome if this is the user's first interaction
      if (firstMessageWelcome) {
        logger.info('Prepending first message welcome to LLM result', { userId: session.userId })
        const resultStr = Array.isArray(result) ? result.join('\n\n') : result
        return `${firstMessageWelcome}\n\n${resultStr}`
      }

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
