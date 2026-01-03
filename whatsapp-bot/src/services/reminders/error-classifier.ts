/**
 * Error Classification for Statement Reminders
 *
 * Classifies errors as transient (retry) or permanent (skip) to optimize
 * delivery success rate while respecting rate limits.
 */

/**
 * Determine if an error is transient (should retry) or permanent (should skip)
 *
 * Transient errors:
 * - Network timeout
 * - Connection refused/reset
 * - WhatsApp API rate limit (429)
 * - Temporary connection issues
 * - Socket hang up
 *
 * Permanent errors:
 * - Invalid WhatsApp number (400)
 * - User blocked bot (403)
 * - Auth error / session expired (401)
 * - User not found (404)
 * - Invalid request format (400)
 *
 * Returns: true if should retry, false if should skip
 */
export function isTransientError(error: Error | unknown): boolean {
  if (!error) return false

  const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  const errorString = String(error).toLowerCase()

  // Network/connection errors (transient - retry)
  if (
    errorMessage.includes('timeout') ||
    errorMessage.includes('etimedout') ||
    errorMessage.includes('econnrefused') ||
    errorMessage.includes('econnreset') ||
    errorMessage.includes('socket hang up') ||
    errorMessage.includes('network') ||
    errorMessage.includes('connection')
  ) {
    return true
  }

  // Rate limit (transient - retry with backoff)
  if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
    return true
  }

  // Temporary service unavailable (transient - retry)
  if (errorMessage.includes('503') || errorMessage.includes('service unavailable')) {
    return true
  }

  // User-related permanent errors (don't retry)
  if (
    errorMessage.includes('blocked') ||
    errorMessage.includes('unauthorized') ||
    errorMessage.includes('401') ||
    errorMessage.includes('403') ||
    (errorMessage.includes('invalid') && errorMessage.includes('number')) ||
    errorMessage.includes('not found') ||
    errorMessage.includes('404') ||
    errorMessage.includes('bad request') ||
    errorMessage.includes('400')
  ) {
    return false
  }

  // Auth/session errors (permanent - requires re-auth)
  if (
    errorMessage.includes('auth') ||
    errorMessage.includes('session') ||
    errorMessage.includes('credentials')
  ) {
    return false
  }

  // Default: treat unknown errors as transient (retry once, then give up)
  // This is conservative - better to retry once than to give up immediately
  return true
}

/**
 * Get a human-readable error category
 */
export function getErrorCategory(error: Error | unknown): string {
  if (!error) return 'unknown'

  const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()

  if (errorMessage.includes('timeout') || errorMessage.includes('etimedout')) {
    return 'network_timeout'
  }

  if (errorMessage.includes('econnrefused') || errorMessage.includes('econnreset')) {
    return 'connection_error'
  }

  if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
    return 'rate_limit'
  }

  if (errorMessage.includes('blocked')) {
    return 'user_blocked'
  }

  if (errorMessage.includes('auth') || errorMessage.includes('401')) {
    return 'auth_error'
  }

  if (errorMessage.includes('session')) {
    return 'session_expired'
  }

  if (errorMessage.includes('invalid number') || errorMessage.includes('400')) {
    return 'invalid_number'
  }

  if (errorMessage.includes('not found') || errorMessage.includes('404')) {
    return 'user_not_found'
  }

  return 'unknown'
}
