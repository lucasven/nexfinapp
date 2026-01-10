/**
 * Shared utilities for server actions.
 *
 * This module provides common patterns extracted from action files:
 * - Authentication helpers
 * - Input validation
 * - RPC result parsing
 * - Path revalidation
 *
 * NOTE: "use server" directive is NOT needed here as the actual server
 * actions are marked with "use server" in their respective module files.
 *
 * @example
 * import {
 *   getAuthenticatedUser,
 *   isValidUUID,
 *   parseRpcResultWithError,
 *   revalidateTransactionPaths
 * } from "./shared"
 */

// Authentication utilities
export {
  getAuthenticatedUser,
  requireAuthenticatedUser,
  type AuthResult,
} from "./auth"

// Validation utilities
export {
  isValidUUID,
  validateUUID,
  validatePositiveNumber,
  validateRange,
  type UUIDValidationResult,
} from "./validation"

// RPC parsing utilities
export {
  parseRpcResult,
  parseRpcResultWithError,
  type RpcResult,
  type RpcParseResult,
} from "./rpc"

// Path revalidation utilities
export {
  REVALIDATE_PATHS,
  revalidateTransactionPaths,
  revalidateInstallmentPaths,
  revalidateSettingsPaths,
  revalidateCategoryPaths,
  revalidateRecurringPaths,
  revalidateAdminPaths,
  revalidateAllPaths,
} from "./paths"
