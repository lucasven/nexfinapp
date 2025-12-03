/**
 * Payment Method Helper Functions
 *
 * Helper functions for working with payment methods, including lookup and creation.
 * These functions bridge the gap between string-based payment methods (current state)
 * and ID-based payment methods (future state for credit card features).
 *
 * Story: 1-3-credit-mode-vs-simple-mode-selection-whatsapp
 * Note: These functions will be activated when payment_methods table is created
 */

import { getSupabaseClient } from '../services/database/supabase-client.js'
import { logger } from '../services/monitoring/logger.js'

/**
 * Find or create a payment method by name
 *
 * Looks up a payment method by name for a user, creating it if it doesn't exist.
 * This allows bridging the current string-based system with the future ID-based system.
 *
 * @param userId - User UUID
 * @param paymentMethodName - Name of the payment method (e.g., "Nubank", "Cartão de Crédito")
 * @param type - Payment method type ('credit', 'debit', 'cash', 'pix', etc.)
 * @returns Payment method ID or null if operation failed
 */
export async function findOrCreatePaymentMethod(
  userId: string,
  paymentMethodName: string,
  type: 'credit' | 'debit' | 'cash' | 'pix' | 'other' = 'other'
): Promise<{ id: string; name: string } | null> {
  const supabase = getSupabaseClient()

  try {
    // First, try to find existing payment method by name
    const { data: existing, error: findError } = await supabase
      .from('payment_methods')
      .select('id, name')
      .eq('user_id', userId)
      .eq('name', paymentMethodName)
      .maybeSingle()

    if (findError) {
      logger.error('Error finding payment method', {
        userId,
        paymentMethodName
      }, findError)
      return null
    }

    if (existing) {
      logger.info('Found existing payment method', {
        userId,
        paymentMethodId: existing.id,
        name: existing.name
      })
      return { id: existing.id, name: existing.name }
    }

    // Payment method doesn't exist - create it
    const { data: created, error: createError } = await supabase
      .from('payment_methods')
      .insert({
        user_id: userId,
        name: paymentMethodName,
        type: type,
        credit_mode: type === 'credit' ? null : undefined // Only set credit_mode for credit cards
      })
      .select('id, name')
      .single()

    if (createError) {
      logger.error('Error creating payment method', {
        userId,
        paymentMethodName,
        type
      }, createError)
      return null
    }

    logger.info('Created new payment method', {
      userId,
      paymentMethodId: created.id,
      name: created.name,
      type
    })

    return { id: created.id, name: created.name }
  } catch (error) {
    logger.error('Unexpected error in findOrCreatePaymentMethod', {
      userId,
      paymentMethodName
    }, error as Error)
    return null
  }
}

/**
 * Detect payment method type from name
 *
 * Analyzes payment method name to determine if it's a credit card, debit card, etc.
 * Uses keyword matching to make intelligent guesses.
 *
 * @param paymentMethodName - Name of the payment method
 * @returns Detected type
 */
export function detectPaymentMethodType(
  paymentMethodName: string
): 'credit' | 'debit' | 'cash' | 'pix' | 'other' {
  const normalized = paymentMethodName.toLowerCase()

  // Credit card keywords
  if (
    normalized.includes('crédito') ||
    normalized.includes('credit') ||
    normalized.includes('cartão de crédito') ||
    normalized.includes('credit card')
  ) {
    return 'credit'
  }

  // Debit card keywords
  if (
    normalized.includes('débito') ||
    normalized.includes('debit') ||
    normalized.includes('cartão de débito') ||
    normalized.includes('debit card')
  ) {
    return 'debit'
  }

  // PIX keywords
  if (normalized.includes('pix')) {
    return 'pix'
  }

  // Cash keywords
  if (
    normalized.includes('dinheiro') ||
    normalized.includes('cash') ||
    normalized.includes('espécie')
  ) {
    return 'cash'
  }

  // Default to 'other'
  return 'other'
}
