/**
 * Installments Actions
 *
 * This file has been refactored into smaller, focused modules:
 * - installments/create.ts: Create installment plans
 * - installments/commitments.ts: Future commitments views
 * - installments/list.ts: List and count installments
 * - installments/details.ts: Installment details view
 * - installments/payoff.ts: Pay off installments early
 * - installments/update.ts: Update installment plans
 * - installments/delete.ts: Delete installment plans
 * - installments/linking.ts: Transaction linking
 *
 * All exports are re-exported here for backward compatibility.
 * New imports should use "@/lib/actions/installments" (this file)
 * or import from specific modules directly.
 *
 * NOTE: "use server" directive is NOT needed here as the actual server
 * actions are marked with "use server" in their respective module files.
 */

export * from "./installments/index"
