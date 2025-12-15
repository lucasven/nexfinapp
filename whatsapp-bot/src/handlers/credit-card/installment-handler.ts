/**
 * Installment Handler
 * Epic 2 Story 2.1: Add Installment Purchase (WhatsApp)
 *
 * Handles creating installment purchases via natural language
 * Validates Credit Mode, creates plan + payments atomically via RPC
 */

import { ParsedIntent } from '../../types.js'
import { getSupabaseClient } from '../../services/database/supabase-client.js'
import { getUserSession } from '../../auth/session-manager.js'
import { logger } from '../../services/monitoring/logger.js'
import { messages as ptBR } from '../../localization/pt-br.js'
import { messages as en } from '../../localization/en.js'
import { getUserLocale } from '../../localization/i18n.js'
import { trackEvent } from '../../analytics/index.js'
import { WhatsAppAnalyticsEvent, WhatsAppAnalyticsProperty } from '../../analytics/events.js'
import { format, addMonths } from 'date-fns'
import { ptBR as ptBRLocale } from 'date-fns/locale'
import {
  storePendingInstallmentContext,
  getPendingInstallmentContext,
  clearPendingInstallmentContext
} from '../../services/conversation/pending-installment-state.js'
import { getStatementPeriodForDate } from '../../utils/statement-period-helpers.js'

interface InstallmentPlanResult {
  plan_id: string
  success: boolean
  error_message: string | null
}

/**
 * Handle installment creation from WhatsApp
 * AC1.1, AC1.2, AC1.3, AC1.4
 */
export async function handleCreateInstallment(
  whatsappNumber: string,
  intent: ParsedIntent
): Promise<string> {
  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return ptBR.notAuthenticated
    }

    const locale = await getUserLocale(session.userId)
    const messages = locale === 'pt-br' ? ptBR : en

    const { amount, installments, description, merchant, firstPaymentDate } = intent.entities

    // AC1.1: Validate extracted data
    if (!amount || !installments) {
      logger.warn('Missing required installment fields', {
        userId: session.userId,
        amount,
        installments
      })

      // Ask for clarification
      if (!amount) {
        return messages.installment?.clarify_amount || 'Qual foi o valor total da compra?'
      }
      if (!installments) {
        return messages.installment?.clarify_installments || 'Em quantas parcelas?'
      }
    }

    // Validate amount and installments
    if (amount <= 0) {
      trackEvent(
        WhatsAppAnalyticsEvent.WHATSAPP_TRANSACTION_FAILED,
        session.userId,
        {
          error: 'negative_amount',
          amount,
          channel: 'whatsapp'
        }
      )
      return locale === 'pt-br'
        ? 'O valor deve ser maior que zero'
        : 'Amount must be greater than zero'
    }

    if (installments < 1 || installments > 60) {
      trackEvent(
        WhatsAppAnalyticsEvent.WHATSAPP_TRANSACTION_FAILED,
        session.userId,
        {
          error: 'invalid_installments',
          installments,
          channel: 'whatsapp'
        }
      )
      return locale === 'pt-br'
        ? 'Número de parcelas deve ser entre 1 e 60'
        : 'Number of installments must be between 1 and 60'
    }

    // AC1.2: Credit Mode Validation - Check user's payment methods
    const supabase = getSupabaseClient()

    const { data: creditCards, error: pmError } = await supabase
      .from('payment_methods')
      .select('id, name, type, credit_mode')
      .eq('user_id', session.userId)
      .eq('type', 'credit')
      .eq('credit_mode', true)

    if (pmError) {
      logger.error('Error fetching payment methods', { userId: session.userId }, pmError)
      return messages.genericError
    }

    // Scenario 1: Simple Mode user (no Credit Mode cards)
    if (!creditCards || creditCards.length === 0) {
      logger.info('Installment blocked - Simple Mode user', {
        userId: session.userId,
        whatsappNumber
      })

      trackEvent(
        'installment_blocked_simple_mode',
        session.userId,
        {
          channel: 'whatsapp',
          amount,
          installments
        }
      )

      return locale === 'pt-br'
        ? messages.installment?.blocked_simple_mode || 'Para usar parcelamentos, você precisa ativar o Modo Crédito. Deseja ativar agora?'
        : 'To use installments, you need to activate Credit Mode. Would you like to activate it now?'
    }

    // Scenario 2 & 3: Credit Mode user
    let selectedPaymentMethodId: string

    if (creditCards.length === 1) {
      // Scenario 2: Single credit card - auto-select
      selectedPaymentMethodId = creditCards[0].id
      logger.info('Auto-selected single credit card', {
        userId: session.userId,
        paymentMethodId: selectedPaymentMethodId
      })
    } else {
      // Scenario 3: Multiple credit cards - prompt user to select
      logger.info('Multiple credit cards found - prompting user to select', {
        userId: session.userId,
        cardCount: creditCards.length
      })

      // Store pending installment context
      storePendingInstallmentContext(whatsappNumber, {
        amount,
        installments,
        description,
        merchant,
        firstPaymentDate,
        creditCards: creditCards.map(card => ({ id: card.id, name: card.name })),
        locale: locale as 'pt-br' | 'en'
      })

      // Format card selection prompt
      const cardList = creditCards
        .map((card, index) => `(${index + 1}) ${card.name}`)
        .join(' ')

      return locale === 'pt-br'
        ? `Qual cartão você usou?\n${cardList}`
        : `Which card did you use?\n${cardList}`
    }

    // AC1.3: Create installment plan via RPC
    const firstPayment = firstPaymentDate || new Date().toISOString().split('T')[0]

    logger.info('Creating installment plan', {
      userId: session.userId,
      paymentMethodId: selectedPaymentMethodId,
      amount,
      installments,
      firstPayment
    })

    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('create_installment_plan_atomic', {
        p_user_id: session.userId,
        p_payment_method_id: selectedPaymentMethodId,
        p_description: description || 'Parcelamento',
        p_total_amount: amount,
        p_total_installments: installments,
        p_merchant: merchant || null,
        p_category_id: null,
        p_first_payment_date: firstPayment
      })

    if (rpcError || !rpcResult || !rpcResult[0]) {
      logger.error('RPC error creating installment plan', {
        userId: session.userId,
        rpcError
      }, rpcError as Error)

      trackEvent(
        'installment_creation_failed',
        session.userId,
        {
          error: rpcError?.message || 'unknown',
          amount,
          installments,
          channel: 'whatsapp'
        }
      )

      return messages.genericError
    }

    const result = rpcResult[0] as InstallmentPlanResult

    if (!result.success) {
      logger.error('Installment plan creation failed', {
        userId: session.userId,
        errorMessage: result.error_message
      })

      trackEvent(
        'installment_creation_failed',
        session.userId,
        {
          error: result.error_message || 'unknown',
          amount,
          installments,
          channel: 'whatsapp'
        }
      )

      // Return user-friendly error message
      return locale === 'pt-br'
        ? result.error_message || 'Erro ao criar parcelamento'
        : result.error_message || 'Error creating installment'
    }

    const planId = result.plan_id

    logger.info('Installment plan created successfully', {
      userId: session.userId,
      planId,
      amount,
      installments
    })

    // Create transactions for each installment payment (same as frontend)
    // Fetch all installment payments created by the RPC
    const { data: payments, error: paymentsError } = await supabase
      .from('installment_payments')
      .select('*')
      .eq('plan_id', planId)
      .order('installment_number', { ascending: true })

    if (paymentsError || !payments) {
      logger.error('Error fetching installment payments after creation', {
        userId: session.userId,
        planId,
        paymentsError
      })
      // Continue without creating transactions - plan was already created
    } else {
      // Get payment method details for statement period calculation
      const { data: paymentMethodDetails, error: pmDetailsError } = await supabase
        .from('payment_methods')
        .select('statement_closing_day')
        .eq('id', selectedPaymentMethodId)
        .single()

      if (pmDetailsError) {
        logger.error('Error fetching payment method details', {
          userId: session.userId,
          paymentMethodId: selectedPaymentMethodId
        })
      }

      // Create transactions for each installment payment
      let transactionsCreated = 0
      let transactionsFailed = 0

      for (const payment of payments) {
        try {
          // Generate description with installment number
          const transactionDescription = `${description || 'Parcelamento'} (${payment.installment_number}/${installments})`

          // Generate user-readable ID
          const { data: readableIdData, error: idError } = await supabase.rpc('generate_transaction_id')

          if (idError) {
            logger.error('Error generating transaction ID', {
              userId: session.userId,
              planId,
              installmentNumber: payment.installment_number
            })
            transactionsFailed++
            continue
          }

          // Create transaction
          const { data: transaction, error: txError } = await supabase
            .from('transactions')
            .insert({
              user_id: session.userId,
              amount: payment.amount,
              type: 'expense',
              category_id: null, // WhatsApp doesn't have category in intent
              description: transactionDescription,
              date: payment.due_date,
              payment_method_id: selectedPaymentMethodId,
              user_readable_id: readableIdData,
              metadata: {
                installment_source: true,
                installment_plan_id: planId,
                installment_number: payment.installment_number,
                total_installments: installments
              }
            })
            .select()
            .single()

          if (txError || !transaction) {
            logger.error('Error creating transaction for installment payment', {
              userId: session.userId,
              planId,
              installmentNumber: payment.installment_number,
              txError
            })
            transactionsFailed++
            continue
          }

          // Determine if this payment is in current/past period
          let isPastOrCurrent = false
          if (paymentMethodDetails?.statement_closing_day != null) {
            const paymentDate = new Date(payment.due_date)
            const periodInfo = getStatementPeriodForDate(
              paymentMethodDetails.statement_closing_day,
              paymentDate,
              new Date()
            )
            isPastOrCurrent = periodInfo.period === 'past' || periodInfo.period === 'current'
          }

          // Link transaction to payment and update status
          await supabase
            .from('installment_payments')
            .update({
              transaction_id: transaction.id,
              status: isPastOrCurrent ? 'paid' : 'pending'
            })
            .eq('id', payment.id)

          transactionsCreated++

          // Track analytics for each successful transaction creation
          trackEvent(
            WhatsAppAnalyticsEvent.INSTALLMENT_TRANSACTION_CREATED,
            session.userId,
            {
              planId,
              transactionId: transaction.id,
              installmentNumber: payment.installment_number,
              totalInstallments: installments,
              amount: payment.amount,
              status: isPastOrCurrent ? 'paid' : 'pending',
              channel: 'whatsapp'
            }
          )
        } catch (error) {
          logger.error('Error creating transaction for installment payment', {
            userId: session.userId,
            planId,
            installmentNumber: payment.installment_number
          }, error as Error)
          transactionsFailed++

          trackEvent(
            WhatsAppAnalyticsEvent.INSTALLMENT_TRANSACTION_CREATION_FAILED,
            session.userId,
            {
              planId,
              installmentNumber: payment.installment_number,
              error: (error as Error).message,
              channel: 'whatsapp'
            }
          )
        }
      }

      logger.info('Installment transactions creation completed', {
        userId: session.userId,
        planId,
        transactionsCreated,
        transactionsFailed,
        totalPayments: payments.length
      })

      // Track final event for all transactions
      trackEvent(
        WhatsAppAnalyticsEvent.INSTALLMENT_ALL_TRANSACTIONS_CREATED,
        session.userId,
        {
          planId,
          totalTransactions: payments.length,
          transactionsCreated,
          transactionsFailed,
          channel: 'whatsapp'
        }
      )
    }

    // Track success event
    trackEvent(
      'installment_created',
      session.userId,
      {
        planId,
        paymentMethodId: selectedPaymentMethodId,
        totalAmount: amount,
        totalInstallments: installments,
        monthlyAmount: amount / installments,
        hasDescription: !!description,
        hasMerchant: !!merchant,
        channel: 'whatsapp',
        locale
      }
    )

    // AC1.4: Format confirmation message
    return await formatConfirmationMessage(
      planId,
      amount,
      installments,
      description || 'Parcelamento',
      firstPayment,
      locale as 'pt-br' | 'en'
    )
  } catch (error) {
    logger.error('Error in handleCreateInstallment', { whatsappNumber }, error as Error)
    return ptBR.genericError
  }
}

/**
 * Format installment confirmation message with dates and amounts
 * AC1.4
 */
async function formatConfirmationMessage(
  planId: string,
  totalAmount: number,
  totalInstallments: number,
  description: string,
  firstPaymentDate: string,
  locale: 'pt-br' | 'en'
): Promise<string> {
  const monthlyAmount = totalAmount / totalInstallments
  const firstDate = new Date(firstPaymentDate)
  const lastDate = addMonths(firstDate, totalInstallments - 1)

  // Format dates based on locale
  const formatDateString = (date: Date) => {
    if (locale === 'pt-br') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const checkDate = new Date(date)
      checkDate.setHours(0, 0, 0, 0)

      if (checkDate.getTime() === today.getTime()) {
        return `Hoje (${format(date, 'd MMM yyyy', { locale: ptBRLocale })})`
      }
      return format(date, 'd MMM yyyy', { locale: ptBRLocale })
    } else {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const checkDate = new Date(date)
      checkDate.setHours(0, 0, 0, 0)

      if (checkDate.getTime() === today.getTime()) {
        return `Today (${format(date, 'MMM d, yyyy')})`
      }
      return format(date, 'MMM d, yyyy')
    }
  }

  const formatCurrency = (value: number) => {
    return `R$ ${value.toFixed(2).replace('.', ',')}`
  }

  if (locale === 'pt-br') {
    return `✅ Parcelamento criado: ${description}

💰 Total: ${formatCurrency(totalAmount)} em ${totalInstallments}x de ${formatCurrency(monthlyAmount)}
📅 Primeira parcela: ${formatDateString(firstDate)}
📅 Última parcela: ${formatDateString(lastDate)}

Use /parcelamentos para ver todos os seus parcelamentos ativos.`
  } else {
    return `✅ Installment created: ${description}

💰 Total: ${formatCurrency(totalAmount)} in ${totalInstallments}x of ${formatCurrency(monthlyAmount)}
📅 First payment: ${formatDateString(firstDate)}
📅 Last payment: ${formatDateString(lastDate)}

Use /installments to view all your active installments.`
  }
}

/**
 * Parse user's card selection response
 * AC1.2 Scenario 3
 *
 * Valid inputs:
 * - Number: "1", "2", "3", etc.
 * - Card name: "Nubank", "Itaú", partial matches
 *
 * @param message - User's response message
 * @param creditCards - Available credit cards
 * @returns Selected card ID or null if invalid
 */
function parseCardSelection(message: string, creditCards: Array<{ id: string; name: string }>): string | null {
  const normalized = message.toLowerCase().trim()

  // Helper function to normalize strings for comparison (removes accents)
  const normalizeForComparison = (str: string): string => {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
  }

  // Try to parse as number (1, 2, 3, ...)
  const numberMatch = normalized.match(/^\d+$/)
  if (numberMatch) {
    const index = parseInt(normalized, 10) - 1 // User input is 1-indexed
    if (index >= 0 && index < creditCards.length) {
      return creditCards[index].id
    }
  }

  // Try to match by card name (exact or partial match, accent-insensitive)
  const normalizedInput = normalizeForComparison(message)
  const matchedCard = creditCards.find(card => {
    const normalizedCardName = normalizeForComparison(card.name)
    return normalizedCardName.includes(normalizedInput) || normalizedInput.includes(normalizedCardName)
  })

  return matchedCard?.id || null
}

/**
 * Handle card selection response for installment creation
 * AC1.2 Scenario 3
 *
 * @param whatsappNumber - User's WhatsApp number
 * @param message - User's card selection message
 * @returns Response message or proceeds to create installment
 */
export async function handleCardSelection(
  whatsappNumber: string,
  message: string
): Promise<string> {
  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return ptBR.notAuthenticated
    }

    // Get pending installment context
    const context = getPendingInstallmentContext(whatsappNumber)

    if (!context) {
      logger.warn('No pending installment context found for card selection', {
        whatsappNumber,
        userId: session.userId
      })
      // Default to pt-br when no context
      return 'Não encontrei um parcelamento pendente. Por favor, adicione seu parcelamento novamente.'
    }

    const locale = context.locale
    const messages = locale === 'pt-br' ? ptBR : en

    // Parse card selection
    const selectedCardId = parseCardSelection(message, context.creditCards)

    if (!selectedCardId) {
      // Invalid input - ask again
      logger.info('Invalid card selection input', {
        whatsappNumber,
        userId: session.userId,
        message: message.substring(0, 50)
      })

      const cardList = context.creditCards
        .map((card, index) => `(${index + 1}) ${card.name}`)
        .join(' ')

      return locale === 'pt-br'
        ? `Por favor, escolha um cartão válido:\n${cardList}`
        : `Please choose a valid card:\n${cardList}`
    }

    logger.info('Card selected for installment', {
      userId: session.userId,
      selectedCardId,
      amount: context.amount,
      installments: context.installments
    })

    // Clear pending context
    clearPendingInstallmentContext(whatsappNumber)

    // Create installment plan via RPC
    const supabase = getSupabaseClient()
    const firstPayment = context.firstPaymentDate || new Date().toISOString().split('T')[0]

    logger.info('Creating installment plan after card selection', {
      userId: session.userId,
      paymentMethodId: selectedCardId,
      amount: context.amount,
      installments: context.installments,
      firstPayment
    })

    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('create_installment_plan_atomic', {
        p_user_id: session.userId,
        p_payment_method_id: selectedCardId,
        p_description: context.description || 'Parcelamento',
        p_total_amount: context.amount,
        p_total_installments: context.installments,
        p_merchant: context.merchant || null,
        p_category_id: null,
        p_first_payment_date: firstPayment
      })

    if (rpcError || !rpcResult || !rpcResult[0]) {
      logger.error('RPC error creating installment plan after card selection', {
        userId: session.userId,
        rpcError
      }, rpcError as Error)

      trackEvent(
        'installment_creation_failed',
        session.userId,
        {
          error: rpcError?.message || 'unknown',
          amount: context.amount,
          installments: context.installments,
          channel: 'whatsapp'
        }
      )

      return messages.genericError
    }

    const result = rpcResult[0] as InstallmentPlanResult

    if (!result.success) {
      logger.error('Installment plan creation failed after card selection', {
        userId: session.userId,
        errorMessage: result.error_message
      })

      trackEvent(
        'installment_creation_failed',
        session.userId,
        {
          error: result.error_message || 'unknown',
          amount: context.amount,
          installments: context.installments,
          channel: 'whatsapp'
        }
      )

      return locale === 'pt-br'
        ? result.error_message || 'Erro ao criar parcelamento'
        : result.error_message || 'Error creating installment'
    }

    const planId = result.plan_id

    logger.info('Installment plan created successfully after card selection', {
      userId: session.userId,
      planId,
      amount: context.amount,
      installments: context.installments
    })

    // Create transactions for each installment payment (same as frontend)
    // Fetch all installment payments created by the RPC
    const { data: payments, error: paymentsError } = await supabase
      .from('installment_payments')
      .select('*')
      .eq('plan_id', planId)
      .order('installment_number', { ascending: true })

    if (paymentsError || !payments) {
      logger.error('Error fetching installment payments after card selection', {
        userId: session.userId,
        planId,
        paymentsError
      })
      // Continue without creating transactions - plan was already created
    } else {
      // Get payment method details for statement period calculation
      const { data: paymentMethodDetails, error: pmDetailsError } = await supabase
        .from('payment_methods')
        .select('statement_closing_day')
        .eq('id', selectedCardId)
        .single()

      if (pmDetailsError) {
        logger.error('Error fetching payment method details after card selection', {
          userId: session.userId,
          paymentMethodId: selectedCardId
        })
      }

      // Create transactions for each installment payment
      let transactionsCreated = 0
      let transactionsFailed = 0

      for (const payment of payments) {
        try {
          // Generate description with installment number
          const transactionDescription = `${context.description || 'Parcelamento'} (${payment.installment_number}/${context.installments})`

          // Generate user-readable ID
          const { data: readableIdData, error: idError } = await supabase.rpc('generate_transaction_id')

          if (idError) {
            logger.error('Error generating transaction ID after card selection', {
              userId: session.userId,
              planId,
              installmentNumber: payment.installment_number
            })
            transactionsFailed++
            continue
          }

          // Create transaction
          const { data: transaction, error: txError } = await supabase
            .from('transactions')
            .insert({
              user_id: session.userId,
              amount: payment.amount,
              type: 'expense',
              category_id: null, // WhatsApp doesn't have category in intent
              description: transactionDescription,
              date: payment.due_date,
              payment_method_id: selectedCardId,
              user_readable_id: readableIdData,
              metadata: {
                installment_source: true,
                installment_plan_id: planId,
                installment_number: payment.installment_number,
                total_installments: context.installments
              }
            })
            .select()
            .single()

          if (txError || !transaction) {
            logger.error('Error creating transaction for installment payment after card selection', {
              userId: session.userId,
              planId,
              installmentNumber: payment.installment_number,
              txError
            })
            transactionsFailed++
            continue
          }

          // Determine if this payment is in current/past period
          let isPastOrCurrent = false
          if (paymentMethodDetails?.statement_closing_day != null) {
            const paymentDate = new Date(payment.due_date)
            const periodInfo = getStatementPeriodForDate(
              paymentMethodDetails.statement_closing_day,
              paymentDate,
              new Date()
            )
            isPastOrCurrent = periodInfo.period === 'past' || periodInfo.period === 'current'
          }

          // Link transaction to payment and update status
          await supabase
            .from('installment_payments')
            .update({
              transaction_id: transaction.id,
              status: isPastOrCurrent ? 'paid' : 'pending'
            })
            .eq('id', payment.id)

          transactionsCreated++

          // Track analytics for each successful transaction creation
          trackEvent(
            WhatsAppAnalyticsEvent.INSTALLMENT_TRANSACTION_CREATED,
            session.userId,
            {
              planId,
              transactionId: transaction.id,
              installmentNumber: payment.installment_number,
              totalInstallments: context.installments,
              amount: payment.amount,
              status: isPastOrCurrent ? 'paid' : 'pending',
              channel: 'whatsapp'
            }
          )
        } catch (error) {
          logger.error('Error creating transaction for installment payment after card selection', {
            userId: session.userId,
            planId,
            installmentNumber: payment.installment_number
          }, error as Error)
          transactionsFailed++

          trackEvent(
            WhatsAppAnalyticsEvent.INSTALLMENT_TRANSACTION_CREATION_FAILED,
            session.userId,
            {
              planId,
              installmentNumber: payment.installment_number,
              error: (error as Error).message,
              channel: 'whatsapp'
            }
          )
        }
      }

      logger.info('Installment transactions creation completed after card selection', {
        userId: session.userId,
        planId,
        transactionsCreated,
        transactionsFailed,
        totalPayments: payments.length
      })

      // Track final event for all transactions
      trackEvent(
        WhatsAppAnalyticsEvent.INSTALLMENT_ALL_TRANSACTIONS_CREATED,
        session.userId,
        {
          planId,
          totalTransactions: payments.length,
          transactionsCreated,
          transactionsFailed,
          channel: 'whatsapp'
        }
      )
    }

    // Track success event
    trackEvent(
      'installment_created',
      session.userId,
      {
        planId,
        paymentMethodId: selectedCardId,
        totalAmount: context.amount,
        totalInstallments: context.installments,
        monthlyAmount: context.amount / context.installments,
        hasDescription: !!context.description,
        hasMerchant: !!context.merchant,
        channel: 'whatsapp',
        locale,
        multipleCards: true
      }
    )

    // Format confirmation message
    return await formatConfirmationMessage(
      planId,
      context.amount,
      context.installments,
      context.description || 'Parcelamento',
      firstPayment,
      locale
    )
  } catch (error) {
    logger.error('Error in handleCardSelection', { whatsappNumber }, error as Error)
    return ptBR.genericError
  }
}
