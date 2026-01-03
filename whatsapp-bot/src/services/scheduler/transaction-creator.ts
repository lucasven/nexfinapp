/**
 * Auto-Payment Transaction Creator
 *
 * Story 4.3: Auto-Create Payment Transaction
 *
 * Creates auto-generated payment transactions when credit card statements close.
 * Handles idempotency, system category lookup, default bank account assignment,
 * and localized description formatting.
 *
 * Performance Target: < 200ms per transaction (NFR-Epic4-P3)
 */

import { getSupabaseClient } from '../database/supabase-client.js'
import { logger } from '../monitoring/logger.js'
import { getPostHog } from '../../analytics/posthog-client.js'
import { WhatsAppAnalyticsEvent } from '../../analytics/events.js'
import { messages as ptBRMessages } from '../../localization/pt-br.js'
import { messages as enMessages } from '../../localization/en.js'
import { format } from 'date-fns'
import { ptBR, enUS } from 'date-fns/locale'

/**
 * In-memory cache for system category ID
 * Cache invalidates on server restart (acceptable, rare event)
 * Story 4.5: System Category for Credit Card Payments
 */
let cachedSystemCategoryId: string | null = null

export interface TransactionCreationParams {
  userId: string
  paymentMethodId: string
  paymentMethodName: string
  statementTotal: number
  paymentDueDate: Date
  statementPeriodStart: Date
  statementPeriodEnd: Date
  userLocale: 'pt-BR' | 'en'
}

export interface TransactionCreationResult {
  success: boolean
  transactionId?: string
  error?: string
  errorType?: 'already_exists' | 'category_not_found' | 'database_error' | 'unknown'
}

/**
 * Create auto-payment transaction for a closed statement
 *
 * Steps:
 * 1. Check idempotency (transaction already exists?)
 * 2. Get system category ID for "Pagamento Cartão de Crédito"
 * 3. Get user's default bank account (or NULL)
 * 4. Format description (localized)
 * 5. Create transaction record
 * 6. Track PostHog event
 *
 * @param params Transaction creation parameters
 * @returns Result with success status and transaction ID or error
 */
export async function createAutoPaymentTransaction(
  params: TransactionCreationParams
): Promise<TransactionCreationResult> {
  const startTime = performance.now()
  const supabase = getSupabaseClient()

  try {
    logger.debug('Creating auto-payment transaction', {
      userId: params.userId,
      paymentMethodId: params.paymentMethodId,
      amount: params.statementTotal,
      dueDate: params.paymentDueDate.toISOString(),
    })

    // Step 1: Check idempotency
    const existingTransaction = await checkExistingTransaction(
      params.userId,
      params.paymentMethodId,
      params.statementPeriodEnd
    )

    if (existingTransaction) {
      logger.info('Auto-payment transaction already exists (idempotency)', {
        userId: params.userId,
        paymentMethodId: params.paymentMethodId,
        existingTransactionId: existingTransaction,
      })

      return {
        success: false,
        error: 'already_exists',
        errorType: 'already_exists',
      }
    }

    // Step 2: Get system category ID
    const categoryId = await getSystemCategoryId()

    if (!categoryId) {
      logger.error('System category not found. Deploy Story 4.5 first.', {
        userId: params.userId,
      })

      return {
        success: false,
        error: 'System category not found. Deploy Story 4.5 first.',
        errorType: 'category_not_found',
      }
    }

    // Step 3: Get default bank account (or NULL)
    const bankAccountId = await getDefaultBankAccount(params.userId)

    // Step 4: Format description
    const description = formatAutoPaymentDescription(
      params.paymentMethodName,
      params.statementPeriodEnd,
      params.userLocale
    )

    // Step 5: Create transaction
    const metadata = {
      auto_generated: true,
      source: 'payment_reminder',
      credit_card_id: params.paymentMethodId,
      statement_period_start: params.statementPeriodStart.toISOString(),
      statement_period_end: params.statementPeriodEnd.toISOString(),
      statement_total: params.statementTotal,
    }

    const { data: transaction, error: insertError } = await supabase
      .from('transactions')
      .insert({
        user_id: params.userId,
        amount: params.statementTotal,
        description,
        date: params.paymentDueDate.toISOString().split('T')[0],
        type: 'expense',
        category_id: categoryId,
        payment_method_id: bankAccountId, // NULL if no default bank account
        metadata,
      })
      .select('id')
      .single()

    if (insertError) {
      logger.error('Failed to insert auto-payment transaction', {
        userId: params.userId,
        paymentMethodId: params.paymentMethodId,
      }, insertError)

      return {
        success: false,
        error: insertError.message,
        errorType: 'database_error',
      }
    }

    const executionTime = performance.now() - startTime

    logger.info('Auto-payment transaction created successfully', {
      userId: params.userId,
      paymentMethodId: params.paymentMethodId,
      transactionId: transaction.id,
      amount: params.statementTotal,
      dueDate: params.paymentDueDate.toISOString(),
      executionTime: `${executionTime.toFixed(2)}ms`,
    })

    // Step 6: Track PostHog event
    const posthog = getPostHog()
    if (posthog) {
      posthog.capture({
        distinctId: params.userId,
        event: WhatsAppAnalyticsEvent.AUTO_PAYMENT_CREATED,
        properties: {
          userId: params.userId,
          paymentMethodId: params.paymentMethodId,
          transactionId: transaction.id,
          amount: params.statementTotal,
          statementPeriodStart: params.statementPeriodStart.toISOString(),
          statementPeriodEnd: params.statementPeriodEnd.toISOString(),
          paymentDueDate: params.paymentDueDate.toISOString(),
          assignedBankAccount: !!bankAccountId,
          locale: params.userLocale,
          timestamp: new Date().toISOString(),
          executionTime: `${executionTime.toFixed(2)}ms`,
        },
      })
    }

    return {
      success: true,
      transactionId: transaction.id,
    }
  } catch (error) {
    logger.error('Failed to create auto-payment transaction', {
      userId: params.userId,
      paymentMethodId: params.paymentMethodId,
    }, error as Error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorType: 'unknown',
    }
  }
}

/**
 * Check if auto-payment transaction already exists for this statement
 *
 * Idempotency check via metadata matching:
 * - credit_card_id matches
 * - statement_period_end matches
 * - auto_generated = true
 *
 * @param userId User ID
 * @param creditCardId Credit card payment method ID
 * @param statementPeriodEnd Statement period end date
 * @returns Transaction ID if exists, null otherwise
 */
async function checkExistingTransaction(
  userId: string,
  creditCardId: string,
  statementPeriodEnd: Date
): Promise<string | null> {
  const supabase = getSupabaseClient()

  const periodEndStr = statementPeriodEnd.toISOString()

  const { data, error } = await supabase
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('metadata->>credit_card_id', creditCardId)
    .eq('metadata->>statement_period_end', periodEndStr)
    .eq('metadata->>auto_generated', 'true')
    .limit(1)
    .maybeSingle()

  if (error) {
    logger.error('Error checking for existing auto-payment transaction', {
      userId,
      creditCardId,
    }, error)
    return null
  }

  return data?.id || null
}

/**
 * Get system category ID for "Pagamento Cartão de Crédito"
 *
 * This category is created by Story 4.5.
 * Uses in-memory caching to reduce database queries.
 * Cache invalidates on server restart (acceptable, rare event).
 *
 * Performance:
 * - First query: ~20-30ms (database lookup)
 * - Subsequent queries: <1ms (in-memory cache)
 *
 * @returns Category ID or null if not found
 */
async function getSystemCategoryId(): Promise<string | null> {
  // Return cached value if available
  if (cachedSystemCategoryId) {
    return cachedSystemCategoryId
  }

  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('categories')
    .select('id')
    .eq('is_system', true)
    .eq('name', 'Pagamento Cartão de Crédito')
    .limit(1)
    .maybeSingle()

  if (error) {
    logger.error('Error querying system category', {}, error)
    return null
  }

  if (data?.id) {
    // Cache the category ID for subsequent calls
    cachedSystemCategoryId = data.id
    logger.debug('System category ID cached', { categoryId: data.id })
  }

  return data?.id || null
}

/**
 * Clear the cached system category ID
 * Exported for testing purposes
 */
export function clearSystemCategoryCache(): void {
  cachedSystemCategoryId = null
}

/**
 * Get user's default bank account
 *
 * Queries payment_methods for type='bank' AND is_default=true.
 * Returns first match if found, null otherwise.
 *
 * @param userId User ID
 * @returns Bank account ID or null if no default
 */
async function getDefaultBankAccount(userId: string): Promise<string | null> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('payment_methods')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'bank')
    .eq('is_default', true)
    .limit(1)
    .maybeSingle()

  if (error) {
    logger.error('Error querying default bank account', { userId }, error)
    return null
  }

  return data?.id || null
}

/**
 * Format auto-payment transaction description
 *
 * pt-BR: "Pagamento Cartão [CardName] - Fatura [MonthYear]"
 * en: "[CardName] Payment - Statement [MonthYear]"
 *
 * Month/Year format:
 * - pt-BR: "Jan/2025", "Fev/2025"
 * - en: "Jan/2025", "Feb/2025"
 *
 * @param cardName Payment method name (e.g., "Nubank", "C6")
 * @param statementPeriodEnd Statement period end date
 * @param locale User locale
 * @returns Formatted description
 */
export function formatAutoPaymentDescription(
  cardName: string,
  statementPeriodEnd: Date,
  locale: 'pt-BR' | 'en'
): string {
  // Format month/year based on locale
  const dateLocale = locale === 'pt-BR' ? ptBR : enUS
  const monthYear = format(statementPeriodEnd, 'MMM/yyyy', { locale: dateLocale })

  // Get localized messages
  const messages = locale === 'pt-BR' ? ptBRMessages : enMessages

  // Use localization function (with type guard)
  if (!messages.autoPayment) {
    // Fallback if autoPayment localization is not defined
    return locale === 'pt-BR'
      ? `Pagamento Cartão ${cardName} - Fatura ${monthYear}`
      : `${cardName} Payment - Statement ${monthYear}`
  }

  return messages.autoPayment.descriptionFormat(cardName, monthYear)
}
