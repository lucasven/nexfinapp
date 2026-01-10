/**
 * Actions Root Barrel Export
 *
 * This file re-exports all server actions from the actions directory.
 * Import from "@/lib/actions" for any server action.
 *
 * Structure:
 * - Shared utilities: shared/
 * - Domain modules:
 *   - admin/ - Admin-only operations
 *   - payment-methods/ - Payment method CRUD and settings
 *   - installments/ - Installment plan management
 * - Standalone files:
 *   - transactions.ts - Transaction operations
 *   - categories.ts - Category operations
 *   - budget.ts - Budget progress calculations
 *   - budgets.ts - Budget management
 *   - recurring.ts - Recurring transactions
 *   - profile.ts - User profile operations
 *   - user.ts - User account operations
 *   - reports.ts - Report generation
 *   - onboarding.ts - Onboarding flow
 *   - beta-signup.ts - Beta signup management
 *   - analytics.ts - Analytics tracking
 *   - engagement.ts - User engagement
 *   - groups.ts - Group management
 *
 * NOTE: "use server" directive is NOT needed here as the actual server
 * actions are marked with "use server" in their respective module files.
 */

// Shared utilities
export * from "./shared"

// Domain modules (refactored)
export * from "./admin"
export * from "./payment-methods"
export * from "./installments"

// Standalone action files
export * from "./transactions"
export * from "./categories"
export * from "./budget"
export * from "./budgets"
export * from "./recurring"
export * from "./profile"
export * from "./user"
export * from "./reports"
export * from "./onboarding"
export * from "./beta-signup"
export * from "./analytics"
export * from "./engagement"
export * from "./groups"
