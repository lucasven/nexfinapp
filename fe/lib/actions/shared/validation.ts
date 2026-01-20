/**
 * UUID validation regex (case-insensitive)
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Check if a string is a valid UUID format.
 *
 * @example
 * if (!isValidUUID(paymentMethodId)) {
 *   return { success: false, error: "Invalid payment method ID format" }
 * }
 */
export function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id)
}

/**
 * Result type for validateUUID
 */
export type UUIDValidationResult =
  | { valid: true }
  | { valid: false; error: string }

/**
 * Validate UUID format with descriptive error message.
 *
 * @example
 * const validation = validateUUID(data.payment_method_id, "payment method ID")
 * if (!validation.valid) {
 *   return { success: false, error: validation.error }
 * }
 */
export function validateUUID(id: string, fieldName = "ID"): UUIDValidationResult {
  if (!isValidUUID(id)) {
    return { valid: false, error: `Invalid ${fieldName} format` }
  }
  return { valid: true }
}

/**
 * Validate that a value is a positive number.
 *
 * @example
 * const validation = validatePositiveNumber(amount, "amount")
 * if (!validation.valid) {
 *   return { success: false, error: validation.error }
 * }
 */
export function validatePositiveNumber(
  value: number,
  fieldName = "value"
): { valid: true } | { valid: false; error: string } {
  if (typeof value !== "number" || isNaN(value) || value <= 0) {
    return { valid: false, error: `${fieldName} must be greater than zero` }
  }
  return { valid: true }
}

/**
 * Validate that a number is within a range (inclusive).
 *
 * @example
 * const validation = validateRange(installments, 1, 60, "installments")
 * if (!validation.valid) {
 *   return { success: false, error: validation.error }
 * }
 */
export function validateRange(
  value: number,
  min: number,
  max: number,
  fieldName = "value"
): { valid: true } | { valid: false; error: string } {
  if (typeof value !== "number" || isNaN(value) || value < min || value > max) {
    return { valid: false, error: `${fieldName} must be between ${min} and ${max}` }
  }
  return { valid: true }
}
