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

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: session.userId,
        amount: amount,
        type: type || 'expense',
        category_id: categoryId,
        description: description || null,
        date: transactionDate,
        payment_method: paymentMethod || null,
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

    // Track successful transaction creation
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
        category_match_confidence: matchConfidence,
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

    let response = ''
    if (type === 'income') {
      response = messages.incomeAdded(amount, categoryName, formattedDate) + paymentMethodText + transactionIdText + confidenceText
    } else {
      response = messages.expenseAdded(amount, categoryName, formattedDate) + paymentMethodText + transactionIdText + confidenceText
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

