import { getSupabaseClient } from '../services/database/supabase-client'

/**
 * Checks if a payment method requires credit mode selection.
 *
 * Detection Logic (AC2.1):
 * - Returns `true` when payment_methods.type = 'credit' AND credit_mode IS NULL
 * - Returns `false` when credit_mode is already set (TRUE or FALSE)
 * - Returns `false` for non-credit payment methods (debit, cash)
 * - Query executes in < 100ms (NFR from tech spec)
 *
 * @param paymentMethodId - UUID of the payment method to check
 * @returns Promise<boolean> - True if mode selection is needed, false otherwise
 *
 * @example
 * const needsSelection = await needsCreditModeSelection('pm-123')
 * if (needsSelection) {
 *   // Trigger mode selection flow
 * }
 */
export async function needsCreditModeSelection(
  paymentMethodId: string
): Promise<boolean> {
  const supabase = getSupabaseClient()
  const startTime = performance.now()

  try {
    const { data: paymentMethod, error } = await supabase
      .from('payment_methods')
      .select('type, credit_mode')
      .eq('id', paymentMethodId)
      .single()

    const duration = performance.now() - startTime

    // Log performance for monitoring (target: < 100ms)
    if (duration > 50) {
      console.warn(
        `[Performance] needsCreditModeSelection query took ${duration.toFixed(2)}ms for payment_method_id=${paymentMethodId}`
      )
    }

    if (error) {
      console.error('[CreditModeDetection] Error checking credit mode:', error)
      // Graceful degradation: assume mode NOT needed if query fails
      // Better to allow transaction than block user entirely (Edge Case 3)
      return false
    }

    if (!paymentMethod) {
      console.error(`[CreditModeDetection] Payment method not found: ${paymentMethodId}`)
      return false
    }

    // Mode selection needed if:
    // 1. Payment method is credit card (type = 'credit')
    // 2. User hasn't chosen mode yet (credit_mode IS NULL)
    const needsSelection =
      paymentMethod.type === 'credit' &&
      paymentMethod.credit_mode === null

    console.log(
      `[CreditModeDetection] payment_method_id=${paymentMethodId}, type=${paymentMethod.type}, credit_mode=${paymentMethod.credit_mode}, needs_selection=${needsSelection}, duration=${duration.toFixed(2)}ms`
    )

    return needsSelection
  } catch (error) {
    const duration = performance.now() - startTime
    console.error(
      `[CreditModeDetection] Unexpected error checking payment method ${paymentMethodId} (${duration.toFixed(2)}ms):`,
      error
    )
    // Graceful degradation
    return false
  }
}
