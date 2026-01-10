import { revalidatePath } from "next/cache"

/**
 * Centralized path constants for revalidation.
 * Use these instead of hardcoding paths throughout action files.
 */
export const REVALIDATE_PATHS = {
  // Root
  root: "/",
  locale: "/[locale]",

  // Transactions
  transactions: "/transactions",
  localeTransactions: "/[locale]/transactions",

  // Installments
  installments: "/installments",
  localeInstallments: "/[locale]/installments",

  // Settings
  settings: "/settings",
  localeSettings: "/[locale]/settings",

  // Categories
  categories: "/categories",
  localeCategories: "/[locale]/categories",

  // Recurring
  recurring: "/recurring",
  localeRecurring: "/[locale]/recurring",

  // Dashboard
  dashboard: "/dashboard",
  localeDashboard: "/[locale]/dashboard",

  // Admin
  admin: "/admin",
  localeAdmin: "/[locale]/admin",
} as const

/**
 * Revalidate transaction-related paths.
 * Use after creating, updating, or deleting transactions.
 */
export function revalidateTransactionPaths() {
  revalidatePath(REVALIDATE_PATHS.root)
  revalidatePath(REVALIDATE_PATHS.locale)
  revalidatePath(REVALIDATE_PATHS.transactions)
  revalidatePath(REVALIDATE_PATHS.localeTransactions)
}

/**
 * Revalidate installment-related paths.
 * Use after creating, updating, or deleting installments.
 */
export function revalidateInstallmentPaths() {
  revalidatePath(REVALIDATE_PATHS.root)
  revalidatePath(REVALIDATE_PATHS.locale)
  revalidatePath(REVALIDATE_PATHS.installments)
  revalidatePath(REVALIDATE_PATHS.localeInstallments)
}

/**
 * Revalidate settings-related paths.
 * Use after updating payment method settings, budgets, etc.
 */
export function revalidateSettingsPaths() {
  revalidatePath(REVALIDATE_PATHS.settings)
  revalidatePath(REVALIDATE_PATHS.localeSettings)
  revalidatePath(REVALIDATE_PATHS.transactions)
  revalidatePath(REVALIDATE_PATHS.localeTransactions)
}

/**
 * Revalidate category-related paths.
 * Use after creating, updating, or deleting categories.
 */
export function revalidateCategoryPaths() {
  revalidatePath(REVALIDATE_PATHS.categories)
  revalidatePath(REVALIDATE_PATHS.localeCategories)
  revalidatePath(REVALIDATE_PATHS.transactions)
  revalidatePath(REVALIDATE_PATHS.localeTransactions)
}

/**
 * Revalidate recurring-related paths.
 * Use after creating, updating, or deleting recurring transactions.
 */
export function revalidateRecurringPaths() {
  revalidatePath(REVALIDATE_PATHS.recurring)
  revalidatePath(REVALIDATE_PATHS.localeRecurring)
  revalidatePath(REVALIDATE_PATHS.transactions)
  revalidatePath(REVALIDATE_PATHS.localeTransactions)
}

/**
 * Revalidate admin-related paths.
 * Use after admin operations.
 */
export function revalidateAdminPaths() {
  revalidatePath(REVALIDATE_PATHS.admin)
  revalidatePath(REVALIDATE_PATHS.localeAdmin)
}

/**
 * Revalidate all common paths.
 * Use sparingly - prefer more specific revalidation functions.
 */
export function revalidateAllPaths() {
  Object.values(REVALIDATE_PATHS).forEach(path => {
    revalidatePath(path)
  })
}
