/**
 * Tests for Duplicate Confirmation Handler
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'

jest.mock('../../../auth/session-manager.js')
jest.mock('../../../services/database/supabase-client.js')
jest.mock('../../../services/monitoring/logger.js')

import { isDuplicateReply, extractDuplicateIdFromQuote } from '../../../handlers/transactions/duplicate-confirmation.js'

describe('Duplicate Confirmation Handler', () => {
  describe('isDuplicateReply', () => {
    it('should return true for duplicate reply with ID', () => {
      const result = isDuplicateReply('🆔 Duplicate ID: ABC123')
      expect(result).toBe(true)
    })

    it('should return true for duplicate reply without emoji', () => {
      const result = isDuplicateReply('Duplicate ID: XYZ789')
      expect(result).toBe(true)
    })

    it('should return false for non-duplicate message', () => {
      const result = isDuplicateReply('This is a normal message')
      expect(result).toBe(false)
    })

    it('should be case insensitive', () => {
      const result = isDuplicateReply('duplicate id: abc123')
      expect(result).toBe(true)
    })
  })

  describe('extractDuplicateIdFromQuote', () => {
    it('should extract ID from duplicate reply with emoji', () => {
      const result = extractDuplicateIdFromQuote('🆔 Duplicate ID: ABC123')
      expect(result).toBe('ABC123')
    })

    it('should extract ID from duplicate reply without emoji', () => {
      const result = extractDuplicateIdFromQuote('Duplicate ID: XYZ789')
      expect(result).toBe('XYZ789')
    })

    it('should return null for non-duplicate message', () => {
      const result = extractDuplicateIdFromQuote('This is a normal message')
      expect(result).toBe(null)
    })

    it('should handle lowercase', () => {
      const result = extractDuplicateIdFromQuote('duplicate id: abc123')
      // The function returns the captured group as-is (lowercase)
      expect(result).toBe('abc123')
    })

    it('should extract 6-character ID', () => {
      const result = extractDuplicateIdFromQuote('Duplicate ID: A1B2C3')
      expect(result).toBe('A1B2C3')
    })
  })
})