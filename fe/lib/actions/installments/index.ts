/**
 * Installments Actions Module
 *
 * This module provides server actions for managing installment plans:
 * - Create installment plans with automatic payment generation
 * - View future commitments and monthly breakdowns
 * - List and filter installment plans by status
 * - View detailed payment schedules
 * - Pay off installments early
 * - Update installment details
 * - Delete installment plans
 * - Link transactions to installment payments
 *
 * All exports are re-exported from the parent installments.ts
 * file for backward compatibility.
 *
 * NOTE: "use server" directive is NOT needed here as the actual server
 * actions are marked with "use server" in their respective module files.
 */

// Create installment plans
export { createInstallment } from "./create"

// Future commitments
export { getFutureCommitments, getFutureCommitmentsByMonth } from "./commitments"

// List and count installments
export { getInstallmentPlans, getInstallmentCounts } from "./list"

// Installment details
export { getInstallmentDetails } from "./details"

// Payoff operations
export { getPayoffConfirmationData, payOffInstallment } from "./payoff"

// Update operations
export { updateInstallment } from "./update"

// Delete operations
export { deleteInstallment } from "./delete"

// Transaction linking
export { linkTransactionToInstallmentPayment, markInstallmentPaymentAsPaid } from "./linking"
