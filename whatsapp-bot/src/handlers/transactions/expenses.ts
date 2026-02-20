import { getSupabaseClient } from '../../services/database/supabase-client.js'
import { getUserSession } from '../../auth/session-manager.js'
import { ParsedIntent } from '../../types.js'
import { messages, formatDate } from '../../localization/pt-br.js'
import { checkForDuplicate } from '../../services/detection/duplicate-detector.js'
import { storePendingTransaction } from './duplicate-confirmation.js'
import { logger } from '../../services/monitoring/logger.js'
import { findCategoryWithFallback } from '../../services/category-matcher.js'
import { trackEvent } from '../../analytics/index.js'
import { WhatsAppAnalyticsEvent, WhatsAppAnalyticsProperty } from '../../analytics/events.js'
import { recordMagicMoment, trackTierAction } from '../../services/onboarding/tier-tracker.js'
import { getContextualHint, isFirstExpense } from '../engagement/hints-handler.js'

export async function handleAddExpense(
  whatsappNumber: string,
  intent: ParsedIntent,
  parsingMetricId?: string | null,
  wasNlpParsed?: boolean
): Promise<string> {
  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.notAuthenticated
    }

    logger.info('Adding expense with parsing metric link', {
      whatsappNumber,
      parsingMetricId,
      action: intent.action
    })

    const { amount, category, description, date, type, paymentMethod } = intent.entities

    if (!amount) {
      return messages.invalidAmount
    }

    // Find category ID using improved matching
    const supabase = getSupabaseClient()

    const categoryMatch = await findCategoryWithFallback(category, {
      userId: session.userId,
      type: type || 'expense',
      threshold: 0.6,
      includeCustom: true
    })

    const categoryId = categoryMatch.id
    const matchedCategoryName = categoryMatch.name
    const matchConfidence = categoryMatch.confidence

    // Log low-confidence matches for analysis
    if (matchConfidence < 0.8 && category) {
      logger.info('Low confidence category match', {
        whatsappNumber,
        userId: session.userId,
        inputCategory: category,
        matchedCategory: matchedCategoryName,
        confidence: matchConfidence,
        matchType: categoryMatch.matchType
      })
    }

    // Story 1.2 & 1.3: Credit Mode Detection and Selection
    // Handle payment method and trigger mode selection if needed
    let paymentMethodId: string | null = null
    if (paymentMethod) {
      const { findOrCreatePaymentMethod, detectPaymentMethodType } = await import('../../utils/payment-method-helper.js')
      const { needsCreditModeSelection } = await import('../../utils/credit-mode-detection.js')
      const { storePendingTransactionContext } = await import('../../services/conversation/pending-transaction-state.js')
      const { sendModeSelectionPrompt } = await import('../credit-card/mode-selection.js')
      const { getUserLocale } = await import('../../localization/i18n.js')

      // Detect payment method type from name
      const pmType = detectPaymentMethodType(paymentMethod)

      // Find or create payment method
      const pm = await findOrCreatePaymentMethod(session.userId, paymentMethod, pmType)

      if (pm) {
        paymentMethodId = pm.id

        // Check if credit mode selection is needed
        const needsMode = await needsCreditModeSelection(paymentMethodId)

        if (needsMode) {
          // Get user locale for pending transaction context
          const locale = await getUserLocale(session.userId)

          // Store pending transaction
          storePendingTransactionContext(whatsappNumber, {
            paymentMethodId,
            amount,
            categoryId,
            description,
            date: date || new Date().toISOString().split('T')[0],
            locale: locale as 'pt-BR' | 'en',
            transactionType: (type || 'expense') as 'expense' | 'income'
          })

          logger.info('Credit mode selection triggered', {
            whatsappNumber,
            userId: session.userId,
            paymentMethodId,
            paymentMethodName: paymentMethod
          })

          // Return mode selection prompt (Story 1.3)
          return await sendModeSelectionPrompt(session.userId)
        }

        // Story 1.6: Simple Mode Backward Compatibility
        // If credit_mode = FALSE (Simple Mode), skip all credit-specific features
        // - No installment prompts (Epic 2)
        // - No statement period tracking (Epic 3)
        // - Transaction proceeds as standard expense (same as debit card)
        if (pm.type === 'credit' && pm.credit_mode === false) {
          logger.info('Simple Mode credit card detected - standard transaction flow', {
            whatsappNumber,
            userId: session.userId,
            paymentMethodId,
            paymentMethodName: paymentMethod
          })
          // Continue to standard transaction creation (no credit features)
          // This is the desired behavior for Simple Mode (AC6.1, AC6.8)
        }

        // Future Epic 2: Credit Mode installment logic would go here
        // if (pm.type === 'credit' && pm.credit_mode === true) {
        //   // Prompt for installments, statement period, etc.
        // }
      }
    }

    // Check for duplicate transactions
    const expenseData = {
      amount,
      category,
      description,
      date: date || new Date().toISOString().split('T')[0],
      type: type || 'expense',
      paymentMethod
    }

    const duplicateCheck = await checkForDuplicate(session.userId, expenseData)

    if (duplicateCheck.isDuplicate) {
      // Track duplicate detection
      trackEvent(
        WhatsAppAnalyticsEvent.WHATSAPP_DUPLICATE_DETECTED,
        session.userId,
        {
          [WhatsAppAnalyticsProperty.TRANSACTION_AMOUNT]: amount,
          [WhatsAppAnalyticsProperty.TRANSACTION_TYPE]: type || 'expense',
          duplicate_confidence: duplicateCheck.confidence,
          auto_blocked: duplicateCheck.confidence >= 0.95,
        }
      )

      if (duplicateCheck.confidence >= 0.95) {
        // Auto-block high confidence duplicates
        return messages.duplicateBlocked(duplicateCheck.reason || 'Transação muito similar encontrada')
      } else {
        // Store pending transaction and ask for confirmation
        const duplicateId = storePendingTransaction(whatsappNumber, session.userId, expenseData)

        // Include duplicate ID in the warning message so users can reply to confirm specific duplicates
        return messages.duplicateWarning(
          duplicateCheck.reason || 'Transação similar encontrada',
          Math.round(duplicateCheck.confidence * 100)
        ) + `\n🆔 Duplicate ID: ${duplicateId}`
      }
    }

    // Create transaction
    const transactionDate = date || new Date().toISOString().split('T')[0]

    // Generate user-readable transaction ID
    const { data: idData, error: idError } = await supabase
      .rpc('generate_transaction_id')

    if (idError) {
      logger.error('Error generating transaction ID', { whatsappNumber }, idError)
      return messages.expenseError
    }

    const userReadableId = idData

    // Story 2.0 Part 1: payment_method_id is now required after migration 041
    // Ensure we have a payment_method_id before creating transaction
    if (!paymentMethodId) {
      // If no payment method was specified, use default cash payment method
      const { findOrCreatePaymentMethod } = await import('../../utils/payment-method-helper.js')
      const defaultPm = await findOrCreatePaymentMethod(session.userId, 'Cash', 'cash')
      paymentMethodId = defaultPm?.id || null
    }

    const { data, error} = await supabase
      .from('transactions')
      .insert({
        user_id: session.userId,
        amount: amount,
        type: type || 'expense',
        category_id: categoryId,
        description: description || null,
        date: transactionDate,
        payment_method_id: paymentMethodId, // Required field (Story 2.0)
        user_readable_id: userReadableId,
        match_confidence: matchConfidence,
        match_type: categoryMatch.matchType,
        parsing_metric_id: parsingMetricId || null  // Link to parsing metric
      })
      .select(`
        *,
        category:categories(name)
      `)
      .single()

    if (error) {
      logger.error('Error creating transaction', { whatsappNumber, transactionId: userReadableId }, error)

      // Track transaction creation failure
      trackEvent(
        WhatsAppAnalyticsEvent.WHATSAPP_TRANSACTION_FAILED,
        session.userId,
        {
          [WhatsAppAnalyticsProperty.TRANSACTION_AMOUNT]: amount,
          [WhatsAppAnalyticsProperty.TRANSACTION_TYPE]: type || 'expense',
          [WhatsAppAnalyticsProperty.ERROR_MESSAGE]: error.message,
        }
      )

      return messages.expenseError
    }

    // Get category name for tracking
    const categoryName = data.category?.name || 'Sem categoria'

    // Story 2.0 Part 1: Get payment method for analytics (AC1.8)
    let paymentMethodType = null
    let paymentMethodMode = null
    if (paymentMethodId) {
      const { data: pm } = await supabase
        .from('payment_methods')
        .select('type, credit_mode')
        .eq('id', paymentMethodId)
        .single()

      if (pm) {
        paymentMethodType = pm.type
        paymentMethodMode = pm.type === 'credit'
          ? (pm.credit_mode === true ? 'credit' : pm.credit_mode === false ? 'simple' : null)
          : null
      }
    }

    // Track successful transaction creation with payment method mode
    trackEvent(
      WhatsAppAnalyticsEvent.WHATSAPP_TRANSACTION_CREATED,
      session.userId,
      {
        [WhatsAppAnalyticsProperty.TRANSACTION_ID]: data.id,
        [WhatsAppAnalyticsProperty.TRANSACTION_AMOUNT]: amount,
        [WhatsAppAnalyticsProperty.TRANSACTION_TYPE]: type || 'expense',
        [WhatsAppAnalyticsProperty.TRANSACTION_SOURCE]: 'manual',
        [WhatsAppAnalyticsProperty.CATEGORY_ID]: categoryId,
        [WhatsAppAnalyticsProperty.CATEGORY_NAME]: categoryName,
        [WhatsAppAnalyticsProperty.CATEGORY_MATCHING_METHOD]: categoryMatch.matchType,
        [WhatsAppAnalyticsProperty.PAYMENT_METHOD_ID]: paymentMethodId,
        payment_method_type: paymentMethodType,
        payment_method_mode: paymentMethodMode,
        category_match_confidence: matchConfidence,
        channel: 'whatsapp',
      }
    )

    // Track category matching event
    if (category) {
      trackEvent(
        WhatsAppAnalyticsEvent.NLP_CATEGORY_MATCHED,
        session.userId,
        {
          [WhatsAppAnalyticsProperty.CATEGORY_NAME]: matchedCategoryName,
          [WhatsAppAnalyticsProperty.CATEGORY_MATCHING_METHOD]: categoryMatch.matchType,
          [WhatsAppAnalyticsProperty.INTENT_CONFIDENCE]: matchConfidence,
          input_category: category,
        }
      )
    }

    // NOTE: Auto-linking removed - installments now create transactions upfront
    // All installment transactions are created when the installment plan is created

    // Story 2.5: Record magic moment for first NLP-parsed expense
    // AC-2.5.1: First NLP expense sets magic_moment_at
    // AC-2.5.3: Explicit commands do NOT trigger magic moment (wasNlpParsed=false)
    if (wasNlpParsed && type !== 'income') {
      try {
        const magicMomentResult = await recordMagicMoment(
          session.userId,
          true, // wasNlpParsed
          {
            amount: amount,
            category: categoryName,
          }
        )

        if (magicMomentResult.isFirstMagicMoment) {
          logger.info('Magic moment recorded for user', {
            userId: session.userId,
            transactionId: data.id,
          })
        }
      } catch (magicMomentError) {
        // Don't fail the transaction if magic moment tracking fails
        logger.error('Failed to record magic moment', { userId: session.userId }, magicMomentError as Error)
      }
    }

    // Story 3.2: Track tier action for add_expense (AC-3.2.1)
    // Fire-and-forget - does NOT block response (AC-3.2.9)
    if (type !== 'income') {
      trackTierAction(session.userId, 'add_expense')
    }

    // Link back from parsing_metrics to transaction (bidirectional link)
    if (parsingMetricId && data.id) {
      logger.info('Creating bidirectional link', {
        parsingMetricId,
        transactionId: data.id,
        userReadableId
      })

      const { error: linkError } = await supabase
        .from('parsing_metrics')
        .update({ linked_transaction_id: data.id })
        .eq('id', parsingMetricId)

      if (linkError) {
        logger.warn('Failed to create bidirectional link to parsing metric', {
          parsingMetricId,
          transactionId: data.id,
          error: linkError.message
        })
        // Don't fail the transaction if linking fails
      } else {
        logger.info('Bidirectional link created successfully', {
          parsingMetricId,
          transactionId: data.id
        })
      }
    }

    const formattedDate = formatDate(new Date(transactionDate))
    const paymentMethodText = paymentMethod ? `\n💳 Método: ${paymentMethod}` : ''
    const transactionIdText = `\n🆔 ID: ${userReadableId}`

    // Add confidence indicator if match was uncertain
    let confidenceText = ''
    if (matchConfidence < 0.8 && matchConfidence >= 0.6 && category) {
      confidenceText = `\n\n⚠️ Categoria sugerida com ${Math.round(matchConfidence * 100)}% de certeza. Se estiver incorreta, você pode alterá-la.`
    }

    // Story 3.6: Add statement period context for Credit Mode transactions
    let statementPeriodText = ''
    if (paymentMethodId) {
      const { data: pm } = await supabase
        .from('payment_methods')
        .select('credit_mode, statement_closing_day, payment_due_day, days_before_closing, name')
        .eq('id', paymentMethodId)
        .single()

      if (pm && pm.credit_mode === true && (pm.statement_closing_day != null || pm.days_before_closing != null)) {
        // Calculate statement period for this transaction
        const { getStatementPeriodForDate, formatStatementPeriod, getStatementPeriod } = await import('../../utils/statement-period-helpers.js')
        const { getUserLocale } = await import('../../localization/i18n.js')

        const userLocale = await getUserLocale(session.userId)
        const locale = userLocale === 'en' ? 'en-US' : 'pt-BR'

        // Calculate effective closing day
        const effectiveClosingDay = pm.days_before_closing != null && pm.payment_due_day != null
          ? (() => {
              const d = new Date()
              d.setDate(pm.payment_due_day! - pm.days_before_closing!)
              return d.getDate()
            })()
          : pm.statement_closing_day!

        const periodInfo = getStatementPeriodForDate(
          effectiveClosingDay,
          new Date(transactionDate),
          new Date()
        )

        // Get localized period name
        const { messages: localeMessages } = userLocale === 'en'
          ? await import('../../localization/en.js')
          : await import('../../localization/pt-br.js')

        const periodName = periodInfo.period === 'current'
          ? localeMessages.statementPeriod?.currentPeriod || 'current'
          : periodInfo.period === 'next'
          ? localeMessages.statementPeriod?.nextPeriod || 'next'
          : localeMessages.statementPeriod?.pastPeriod || 'past'

        // Format period dates
        const periodStart = formatStatementPeriod(periodInfo.periodStart, locale, true)
        const periodEnd = formatStatementPeriod(periodInfo.periodEnd, locale, true)

        const periodContext = localeMessages.statementPeriod?.periodContext || 'Statement {period} ({start} - {end})'
        statementPeriodText = `\n📊 ${periodContext
          .replace('{period}', periodName)
          .replace('{start}', periodStart)
          .replace('{end}', periodEnd)}`
      }
    }

    let response = ''
    if (type === 'income') {
      response = messages.incomeAdded(amount, categoryName, formattedDate) + paymentMethodText + transactionIdText + confidenceText + statementPeriodText
    } else {
      response = messages.expenseAdded(amount, categoryName, formattedDate) + paymentMethodText + transactionIdText + confidenceText + statementPeriodText
    }

    // Story 2.6: Contextual hints after actions
    // AC-2.6.5: Hints are appended (not sent as separate message)
    if (type !== 'income') {
      // Check if this is the user's first expense
      const firstExpenseCheck = await isFirstExpense(session.userId)

      // Get contextual hint based on action context
      const hint = await getContextualHint(
        session.userId,
        {
          action: 'add_expense',
          categoryId: categoryId,
          categoryName: categoryName,
          isFirstExpense: firstExpenseCheck,
        },
        messages
      )

      // Append hint to response if applicable
      if (hint) {
        response += hint
      }

      // Legacy first expense celebration (mark as completed)
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('first_expense_added')
        .eq('user_id', session.userId)
        .single()

      if (profile && !profile.first_expense_added) {
        // Mark first expense as added
        await supabase
          .from('user_profiles')
          .update({
            first_expense_added: true,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', session.userId)

        // Only add celebration if no hint was already added
        if (!hint) {
          response += '\n\n🎉 *Parabéns!* Primeira despesa registrada com sucesso!'
        }
      }
    }

    return response
  } catch (error) {
    logger.error('Error in handleAddExpense', { whatsappNumber }, error as Error)
    return messages.expenseError
  }
}

export async function handleShowExpenses(whatsappNumber: string): Promise<string> {
  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.notAuthenticated
    }

    const supabase = getSupabaseClient()

    // Get this month's transactions
    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

    const { data: transactions, error } = await supabase
      .from('transactions')
      .select(`
        *,
        category:categories(name, icon)
      `)
      .eq('user_id', session.userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false })
      .limit(10)

    if (error) {
      logger.error('Error fetching transactions', { whatsappNumber, userId: session.userId }, error)
      return messages.genericError
    }

    if (!transactions || transactions.length === 0) {
      return messages.noTransactions
    }

    let response = '📋 *Últimas transações (este mês):*\n\n'

    for (const tx of transactions) {
      const icon = tx.category?.icon || (tx.type === 'income' ? '💰' : '💸')
      const sign = tx.type === 'income' ? '+' : '-'
      const categoryName = tx.category?.name || 'Sem categoria'
      const formattedDate = formatDate(new Date(tx.date))
      
      response += `${icon} ${sign}R$ ${tx.amount}\n`
      response += `   ${categoryName} - ${formattedDate}\n`
      if (tx.description) {
        response += `   "${tx.description}"\n`
      }
      if (tx.payment_method) {
        response += `   💳 ${tx.payment_method}\n`
      }
      response += '\n'
    }

    // Add totals
    const totalIncome = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0)
    
    const totalExpenses = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0)

    response += `\n💰 Receitas: R$ ${totalIncome.toFixed(2)}\n`
    response += `💸 Despesas: R$ ${totalExpenses.toFixed(2)}\n`
    response += `📊 Saldo: R$ ${(totalIncome - totalExpenses).toFixed(2)}`

    return response
  } catch (error) {
    logger.error('Error in handleShowExpenses', { whatsappNumber }, error as Error)
    return messages.genericError
  }
}

