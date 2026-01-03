/**
 * TypeScript type definitions for Supabase RPC functions
 * Story: 2.0 - Epic 2 Foundation & Blockers Resolution (Part 3)
 * Date: 2025-12-02
 */

// ============================================================================
// switch_credit_mode_atomic()
// ============================================================================

/**
 * Parameters for switch_credit_mode_atomic RPC function
 */
export interface SwitchCreditModeParams {
  p_user_id: string
  p_payment_method_id: string
  p_new_mode: boolean
  p_cleanup_installments?: boolean
}

/**
 * Return type for switch_credit_mode_atomic RPC function
 */
export interface SwitchCreditModeResult {
  success: boolean
  error_message: string | null
}

// ============================================================================
// create_installment_plan_atomic()
// ============================================================================

/**
 * Parameters for create_installment_plan_atomic RPC function
 */
export interface CreateInstallmentPlanParams {
  p_user_id: string
  p_payment_method_id: string
  p_description: string
  p_total_amount: number
  p_total_installments: number
  p_merchant: string | null
  p_category_id: string | null
  p_first_payment_date: string // ISO date string (YYYY-MM-DD)
}

/**
 * Return type for create_installment_plan_atomic RPC function
 */
export interface CreateInstallmentPlanResult {
  plan_id: string | null
  success: boolean
  error_message: string | null
}

// ============================================================================
// delete_installment_plan_atomic()
// ============================================================================

/**
 * Parameters for delete_installment_plan_atomic RPC function
 */
export interface DeleteInstallmentPlanParams {
  p_user_id: string
  p_plan_id: string
  p_delete_type: 'cancel' | 'paid_off'
}

/**
 * Return type for delete_installment_plan_atomic RPC function
 */
export interface DeleteInstallmentPlanResult {
  success: boolean
  error_message: string | null
}

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Generic RPC error response
 */
export interface RpcError {
  success: false
  error_message: string
}

/**
 * Type guard for RPC errors
 */
export function isRpcError<T extends { success: boolean; error_message: string | null }>(
  result: T
): result is T & RpcError {
  return !result.success && result.error_message !== null
}

// ============================================================================
// get_budget_for_period()
// ============================================================================

/**
 * Parameters for get_budget_for_period RPC function
 */
export interface GetBudgetForPeriodParams {
  p_user_id: string
  p_payment_method_id: string
  p_period_start: string // ISO date string (YYYY-MM-DD)
  p_period_end: string // ISO date string (YYYY-MM-DD)
}

/**
 * Row returned by get_budget_for_period RPC function
 */
export interface BudgetPeriodRow {
  date: string // DATE type
  description: string
  amount: number
  category_id: string | null
  category_name: string
  category_emoji: string | null
  is_installment: boolean
  installment_number: number | null
  total_installments: number | null
  plan_description: string | null
}

// ============================================================================
// calculate_statement_period()
// ============================================================================

/**
 * Parameters for calculate_statement_period RPC function
 * Story: 3.1 - Set Statement Closing Date
 */
export interface CalculateStatementPeriodParams {
  p_closing_day: number
  p_reference_date?: string // ISO date string (YYYY-MM-DD), defaults to today
}

/**
 * Return type for calculate_statement_period RPC function
 * Returns statement period boundaries for a given closing day
 */
export interface StatementPeriod {
  period_start: string // ISO date string (YYYY-MM-DD)
  period_end: string // ISO date string (YYYY-MM-DD)
  next_closing: string // ISO date string (YYYY-MM-DD)
}

// ============================================================================
// Budget Progress Types (Story 3.3)
// ============================================================================

/**
 * Budget progress data for a payment method
 * Story: 3.3 - Budget Progress Dashboard Statement Period
 */
export interface BudgetProgress {
  paymentMethodId: string
  paymentMethodName: string
  monthlyBudget: number
  spentAmount: number
  remainingAmount: number
  percentageUsed: number
  status: 'on-track' | 'near-limit' | 'exceeded'
  periodStart: Date
  periodEnd: Date
  daysUntilClosing: number
}

/**
 * Budget status based on percentage used
 * - on-track: 0-79% of budget used (Blue)
 * - near-limit: 80-99% of budget used (Yellow/Amber)
 * - exceeded: 100%+ of budget used (Gray, NOT red - awareness-first)
 */
export type BudgetStatus = 'on-track' | 'near-limit' | 'exceeded'
