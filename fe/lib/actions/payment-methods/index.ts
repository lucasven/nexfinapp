/**
 * Payment Methods Actions Module
 *
 * This module provides server actions for managing payment methods:
 * - CRUD operations (create, read, delete)
 * - Credit mode selection and switching
 * - Statement settings (closing day)
 * - Budget management
 * - Payment due date configuration
 * - Statement summary
 *
 * All exports are re-exported from the parent payment-methods.ts
 * file for backward compatibility.
 *
 * NOTE: "use server" directive is NOT needed here as the actual server
 * actions are marked with "use server" in their respective module files.
 */

// Credit mode operations
export { setCreditMode, switchCreditMode } from "./credit-mode"
export type { SwitchResult } from "./credit-mode"

// CRUD operations
export { getPaymentMethods, findOrCreatePaymentMethod, updatePaymentMethod, deletePaymentMethod } from "./crud"

// Statement settings
export { getStatementPeriodPreview, updateStatementSettings } from "./statement-settings"

// Budget management
export { setMonthlyBudget } from "./budget"

// Payment due date
export { setPaymentDueDate, getPaymentDueDatePreview } from "./payment-due-date"

// Statement summary
export { getStatementSummary } from "./statement-summary"

// Credit card creation
export { createCreditCard } from "./create-card"

// Credit card settings update
export { updateCreditCardSettings } from "./update-settings"
