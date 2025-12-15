/**
 * Tests for Error Classifier
 *
 * AC4.4: Reminder Delivery Success Rate
 * - Transient errors (retry): network timeout, rate limit, connection errors
 * - Permanent errors (skip): blocked user, invalid number, auth errors
 */

import { isTransientError, getErrorCategory } from '../../../services/reminders/error-classifier.js'

describe('Error Classifier', () => {
  describe('isTransientError', () => {
    describe('Transient Errors (should retry)', () => {
      it('should classify network timeout as transient', () => {
        const error = new Error('ETIMEDOUT: connection timeout')
        expect(isTransientError(error)).toBe(true)
      })

      it('should classify connection refused as transient', () => {
        const error = new Error('ECONNREFUSED: connection refused')
        expect(isTransientError(error)).toBe(true)
      })

      it('should classify connection reset as transient', () => {
        const error = new Error('ECONNRESET: connection reset by peer')
        expect(isTransientError(error)).toBe(true)
      })

      it('should classify socket hang up as transient', () => {
        const error = new Error('socket hang up')
        expect(isTransientError(error)).toBe(true)
      })

      it('should classify network errors as transient', () => {
        const error = new Error('Network error occurred')
        expect(isTransientError(error)).toBe(true)
      })

      it('should classify rate limit errors as transient', () => {
        const error = new Error('Rate limit exceeded')
        expect(isTransientError(error)).toBe(true)
      })

      it('should classify 429 status as transient', () => {
        const error = new Error('HTTP 429: Too many requests')
        expect(isTransientError(error)).toBe(true)
      })

      it('should classify 503 service unavailable as transient', () => {
        const error = new Error('503 Service Unavailable')
        expect(isTransientError(error)).toBe(true)
      })
    })

    describe('Permanent Errors (should not retry)', () => {
      it('should classify blocked user as permanent', () => {
        const error = new Error('User has blocked this bot')
        expect(isTransientError(error)).toBe(false)
      })

      it('should classify 401 unauthorized as permanent', () => {
        const error = new Error('401 Unauthorized')
        expect(isTransientError(error)).toBe(false)
      })

      it('should classify 403 forbidden as permanent', () => {
        const error = new Error('403 Forbidden')
        expect(isTransientError(error)).toBe(false)
      })

      it('should classify invalid number as permanent', () => {
        const error = new Error('Invalid WhatsApp number')
        expect(isTransientError(error)).toBe(false)
      })

      it('should classify 404 not found as permanent', () => {
        const error = new Error('404 Not Found')
        expect(isTransientError(error)).toBe(false)
      })

      it('should classify 400 bad request as permanent', () => {
        const error = new Error('400 Bad Request')
        expect(isTransientError(error)).toBe(false)
      })

      it('should classify auth errors as permanent', () => {
        const error = new Error('Authentication failed')
        expect(isTransientError(error)).toBe(false)
      })

      it('should classify session expired as permanent', () => {
        const error = new Error('Session expired')
        expect(isTransientError(error)).toBe(false)
      })

      it('should classify credential errors as permanent', () => {
        const error = new Error('Invalid credentials')
        expect(isTransientError(error)).toBe(false)
      })
    })

    describe('Unknown Errors', () => {
      it('should treat unknown errors as transient (conservative approach)', () => {
        const error = new Error('Some unknown error')
        expect(isTransientError(error)).toBe(true)
      })

      it('should handle null error', () => {
        expect(isTransientError(null)).toBe(false)
      })

      it('should handle undefined error', () => {
        expect(isTransientError(undefined)).toBe(false)
      })

      it('should handle non-Error objects', () => {
        const error = 'String error'
        expect(isTransientError(error)).toBe(true) // Default to transient
      })
    })
  })

  describe('getErrorCategory', () => {
    it('should categorize network timeout', () => {
      const error = new Error('ETIMEDOUT')
      expect(getErrorCategory(error)).toBe('network_timeout')
    })

    it('should categorize connection refused', () => {
      const error = new Error('ECONNREFUSED')
      expect(getErrorCategory(error)).toBe('connection_error')
    })

    it('should categorize connection reset', () => {
      const error = new Error('ECONNRESET')
      expect(getErrorCategory(error)).toBe('connection_error')
    })

    it('should categorize rate limit', () => {
      const error = new Error('Rate limit exceeded')
      expect(getErrorCategory(error)).toBe('rate_limit')
    })

    it('should categorize 429 as rate limit', () => {
      const error = new Error('HTTP 429')
      expect(getErrorCategory(error)).toBe('rate_limit')
    })

    it('should categorize blocked user', () => {
      const error = new Error('User blocked')
      expect(getErrorCategory(error)).toBe('user_blocked')
    })

    it('should categorize auth errors', () => {
      const error = new Error('Authentication failed')
      expect(getErrorCategory(error)).toBe('auth_error')
    })

    it('should categorize 401 as auth error', () => {
      const error = new Error('401 Unauthorized')
      expect(getErrorCategory(error)).toBe('auth_error')
    })

    it('should categorize session expired', () => {
      const error = new Error('Session expired')
      expect(getErrorCategory(error)).toBe('session_expired')
    })

    it('should categorize invalid number', () => {
      const error = new Error('Invalid number format')
      expect(getErrorCategory(error)).toBe('invalid_number')
    })

    it('should categorize 400 as invalid number', () => {
      const error = new Error('400 Bad Request')
      expect(getErrorCategory(error)).toBe('invalid_number')
    })

    it('should categorize 404 as user not found', () => {
      const error = new Error('404 Not Found')
      expect(getErrorCategory(error)).toBe('user_not_found')
    })

    it('should categorize unknown errors', () => {
      const error = new Error('Some weird error')
      expect(getErrorCategory(error)).toBe('unknown')
    })

    it('should handle null error', () => {
      expect(getErrorCategory(null)).toBe('unknown')
    })

    it('should handle undefined error', () => {
      expect(getErrorCategory(undefined)).toBe('unknown')
    })
  })

  describe('Case Insensitivity', () => {
    it('should match error messages case-insensitively', () => {
      expect(isTransientError(new Error('TIMEOUT'))).toBe(true)
      expect(isTransientError(new Error('Timeout'))).toBe(true)
      expect(isTransientError(new Error('timeout'))).toBe(true)
    })

    it('should categorize case-insensitively', () => {
      expect(getErrorCategory(new Error('BLOCKED'))).toBe('user_blocked')
      expect(getErrorCategory(new Error('Blocked'))).toBe('user_blocked')
      expect(getErrorCategory(new Error('blocked'))).toBe('user_blocked')
    })
  })
})
