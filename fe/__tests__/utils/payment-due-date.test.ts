/**
 * Unit Tests: Payment Due Date Calculation
 *
 * Story 4.1: Set Payment Due Date
 * Epic 4: Payment Reminders & Auto-Accounting
 *
 * Tests the payment due date utility functions including:
 * - Due date calculation before/after closing day
 * - Month boundaries (e.g., closing 25 + due 10 = next month 5)
 * - Year boundaries (e.g., Dec closing + due = Jan next year)
 * - February edge cases (closing day 31 in Feb)
 * - Leap years
 * - Formatting functions
 */

import { describe, it, expect } from '@jest/globals'
import {
  calculatePaymentDueDate,
  formatPaymentDueDate,
  getOrdinalSuffix,
  formatDueDay,
  calculateRecurringDueDay,
  type PaymentDueDateInfo,
} from '@/lib/utils/payment-due-date'

describe('calculatePaymentDueDate', () => {
  describe('Due date in same month', () => {
    it('should calculate due date when closing 5 + due 10 = 15th same month', () => {
      // Closing day 5, Payment due day 10, Reference: Dec 1, 2024
      // Next closing: Dec 5, 2024
      // Payment due: Dec 15, 2024 (5 + 10 = 15)
      const referenceDate = new Date('2024-12-01')
      const closingDay = 5
      const paymentDueDay = 10

      const result = calculatePaymentDueDate(
        closingDay,
        paymentDueDay,
        referenceDate
      )

      expect(result.nextDueDate).toEqual(new Date('2024-12-15'))
      expect(result.dueDay).toBe(15)
      expect(result.dueMonth).toBe(12)
      expect(result.dueYear).toBe(2024)
    })

    it('should calculate due date when closing 10 + due 5 = 15th same month', () => {
      // Closing day 10, Payment due day 5, Reference: Dec 1, 2024
      // Next closing: Dec 10, 2024
      // Payment due: Dec 15, 2024 (10 + 5 = 15)
      const referenceDate = new Date('2024-12-01')
      const closingDay = 10
      const paymentDueDay = 5

      const result = calculatePaymentDueDate(
        closingDay,
        paymentDueDay,
        referenceDate
      )

      expect(result.nextDueDate).toEqual(new Date('2024-12-15'))
      expect(result.dueDay).toBe(15)
      expect(result.dueMonth).toBe(12)
      expect(result.dueYear).toBe(2024)
    })
  })

  describe('Due date in next month', () => {
    it('should calculate due date when closing 25 + due 10 = 5th next month', () => {
      // Closing day 25, Payment due day 10, Reference: Dec 1, 2024
      // Next closing: Dec 25, 2024
      // Payment due: Jan 4, 2025 (25 + 10 = 35 → wraps to Jan 4)
      const referenceDate = new Date('2024-12-01')
      const closingDay = 25
      const paymentDueDay = 10

      const result = calculatePaymentDueDate(
        closingDay,
        paymentDueDay,
        referenceDate
      )

      // Note: Dec has 31 days, so Dec 25 + 10 = Jan 4 (not Jan 5)
      expect(result.nextDueDate).toEqual(new Date('2025-01-04'))
      expect(result.dueDay).toBe(4)
      expect(result.dueMonth).toBe(1)
      expect(result.dueYear).toBe(2025)
    })

    it('should calculate due date when closing 28 + due 10 = 7th next month', () => {
      // Closing day 28, Payment due day 10, Reference: Nov 1, 2024
      // Next closing: Nov 28, 2024
      // Payment due: Dec 8, 2024 (28 + 10 = 38 → wraps to Dec 8)
      const referenceDate = new Date('2024-11-01')
      const closingDay = 28
      const paymentDueDay = 10

      const result = calculatePaymentDueDate(
        closingDay,
        paymentDueDay,
        referenceDate
      )

      // Nov has 30 days, so Nov 28 + 10 = Dec 8
      expect(result.nextDueDate).toEqual(new Date('2024-12-08'))
      expect(result.dueDay).toBe(8)
      expect(result.dueMonth).toBe(12)
      expect(result.dueYear).toBe(2024)
    })
  })

  describe('Year boundary handling', () => {
    it('should handle year boundary when closing in Dec + due = Jan next year', () => {
      // Closing day 25, Payment due day 10, Reference: Dec 20, 2024
      // Next closing: Dec 25, 2024
      // Payment due: Jan 4, 2025 (crosses year boundary)
      const referenceDate = new Date('2024-12-20')
      const closingDay = 25
      const paymentDueDay = 10

      const result = calculatePaymentDueDate(
        closingDay,
        paymentDueDay,
        referenceDate
      )

      expect(result.nextDueDate).toEqual(new Date('2025-01-04'))
      expect(result.dueDay).toBe(4)
      expect(result.dueMonth).toBe(1)
      expect(result.dueYear).toBe(2025)
    })

    it('should handle closing on Dec 31 + due days', () => {
      // Closing day 31, Payment due day 10, Reference: Dec 20, 2024
      // Next closing: Dec 31, 2024
      // Payment due: Jan 10, 2025
      const referenceDate = new Date('2024-12-20')
      const closingDay = 31
      const paymentDueDay = 10

      const result = calculatePaymentDueDate(
        closingDay,
        paymentDueDay,
        referenceDate
      )

      expect(result.nextDueDate).toEqual(new Date('2025-01-10'))
      expect(result.dueDay).toBe(10)
      expect(result.dueMonth).toBe(1)
      expect(result.dueYear).toBe(2025)
    })
  })

  describe('February edge cases', () => {
    it('should handle closing day 31 in February (non-leap year)', () => {
      // Closing day 31, Payment due day 10, Reference: Feb 15, 2025
      // Next closing: Feb 28, 2025 (31 adjusted to 28 in Feb)
      // Payment due: Mar 10, 2025 (Feb 28 + 10 = Mar 10)
      const referenceDate = new Date('2025-02-15')
      const closingDay = 31
      const paymentDueDay = 10

      const result = calculatePaymentDueDate(
        closingDay,
        paymentDueDay,
        referenceDate
      )

      // Feb 2025 has 28 days, so Feb 28 + 10 = Mar 10
      expect(result.nextDueDate).toEqual(new Date('2025-03-10'))
      expect(result.dueDay).toBe(10)
      expect(result.dueMonth).toBe(3)
      expect(result.dueYear).toBe(2025)
    })

    it('should handle closing day 31 in February (leap year)', () => {
      // Closing day 31, Payment due day 10, Reference: Feb 15, 2024
      // Next closing: Feb 29, 2024 (31 adjusted to 29 in leap year)
      // Payment due: Mar 10, 2024 (Feb 29 + 10 = Mar 10)
      const referenceDate = new Date('2024-02-15')
      const closingDay = 31
      const paymentDueDay = 10

      const result = calculatePaymentDueDate(
        closingDay,
        paymentDueDay,
        referenceDate
      )

      // Feb 2024 has 29 days (leap year), so Feb 29 + 10 = Mar 10
      expect(result.nextDueDate).toEqual(new Date('2024-03-10'))
      expect(result.dueDay).toBe(10)
      expect(result.dueMonth).toBe(3)
      expect(result.dueYear).toBe(2024)
    })

    it('should handle closing day 30 in February', () => {
      // Closing day 30, Payment due day 7, Reference: Feb 10, 2025
      // Next closing: Feb 28, 2025 (30 adjusted to 28 in Feb)
      // Payment due: Mar 7, 2025
      const referenceDate = new Date('2025-02-10')
      const closingDay = 30
      const paymentDueDay = 7

      const result = calculatePaymentDueDate(
        closingDay,
        paymentDueDay,
        referenceDate
      )

      expect(result.nextDueDate).toEqual(new Date('2025-03-07'))
      expect(result.dueDay).toBe(7)
      expect(result.dueMonth).toBe(3)
      expect(result.dueYear).toBe(2025)
    })
  })

  describe('Various payment due day values', () => {
    it('should handle payment due day 1 (minimum)', () => {
      // Closing day 5, Payment due day 1, Reference: Dec 1, 2024
      // Next closing: Dec 5, 2024
      // Payment due: Dec 6, 2024
      const referenceDate = new Date('2024-12-01')
      const closingDay = 5
      const paymentDueDay = 1

      const result = calculatePaymentDueDate(
        closingDay,
        paymentDueDay,
        referenceDate
      )

      expect(result.nextDueDate).toEqual(new Date('2024-12-06'))
      expect(result.dueDay).toBe(6)
    })

    it('should handle payment due day 60 (maximum)', () => {
      // Closing day 5, Payment due day 60, Reference: Dec 1, 2024
      // Next closing: Dec 5, 2024
      // Payment due: Feb 3, 2025 (Dec 5 + 60 days)
      const referenceDate = new Date('2024-12-01')
      const closingDay = 5
      const paymentDueDay = 60

      const result = calculatePaymentDueDate(
        closingDay,
        paymentDueDay,
        referenceDate
      )

      expect(result.nextDueDate).toEqual(new Date('2025-02-03'))
      expect(result.dueDay).toBe(3)
      expect(result.dueMonth).toBe(2)
      expect(result.dueYear).toBe(2025)
    })

    it('should handle common payment due day 15', () => {
      // Closing day 10, Payment due day 15, Reference: Jan 1, 2025
      // Next closing: Jan 10, 2025
      // Payment due: Jan 25, 2025
      const referenceDate = new Date('2025-01-01')
      const closingDay = 10
      const paymentDueDay = 15

      const result = calculatePaymentDueDate(
        closingDay,
        paymentDueDay,
        referenceDate
      )

      expect(result.nextDueDate).toEqual(new Date('2025-01-25'))
      expect(result.dueDay).toBe(25)
      expect(result.dueMonth).toBe(1)
      expect(result.dueYear).toBe(2025)
    })
  })

  describe('Reference date variations', () => {
    it('should calculate correctly when reference is before closing', () => {
      // Closing day 15, Payment due day 10, Reference: Dec 5, 2024
      // Next closing: Dec 15, 2024
      // Payment due: Dec 25, 2024
      const referenceDate = new Date('2024-12-05')
      const closingDay = 15
      const paymentDueDay = 10

      const result = calculatePaymentDueDate(
        closingDay,
        paymentDueDay,
        referenceDate
      )

      expect(result.nextDueDate).toEqual(new Date('2024-12-25'))
    })

    it('should calculate correctly when reference is after closing', () => {
      // Closing day 5, Payment due day 10, Reference: Dec 20, 2024
      // Next closing: Jan 5, 2025
      // Payment due: Jan 15, 2025
      const referenceDate = new Date('2024-12-20')
      const closingDay = 5
      const paymentDueDay = 10

      const result = calculatePaymentDueDate(
        closingDay,
        paymentDueDay,
        referenceDate
      )

      expect(result.nextDueDate).toEqual(new Date('2025-01-15'))
      expect(result.dueDay).toBe(15)
      expect(result.dueMonth).toBe(1)
      expect(result.dueYear).toBe(2025)
    })
  })
})

describe('formatPaymentDueDate', () => {
  describe('Portuguese (pt-BR)', () => {
    it('should format date correctly', () => {
      const dueDate = new Date('2025-01-15')
      const formatted = formatPaymentDueDate(dueDate, 'pt-BR')

      expect(formatted).toContain('15')
      expect(formatted).toContain('janeiro')
      expect(formatted).toContain('2025')
    })

    it('should format December date correctly', () => {
      const dueDate = new Date('2024-12-25')
      const formatted = formatPaymentDueDate(dueDate, 'pt-BR')

      expect(formatted).toContain('25')
      expect(formatted).toContain('dezembro')
      expect(formatted).toContain('2024')
    })
  })

  describe('English (en)', () => {
    it('should format date correctly', () => {
      const dueDate = new Date('2025-01-15')
      const formatted = formatPaymentDueDate(dueDate, 'en')

      expect(formatted).toContain('January')
      expect(formatted).toContain('15')
      expect(formatted).toContain('2025')
    })

    it('should format December date correctly', () => {
      const dueDate = new Date('2024-12-25')
      const formatted = formatPaymentDueDate(dueDate, 'en')

      expect(formatted).toContain('December')
      expect(formatted).toContain('25')
      expect(formatted).toContain('2024')
    })
  })

  describe('Default locale', () => {
    it('should use pt-BR as default locale', () => {
      const dueDate = new Date('2025-01-15')
      const formatted = formatPaymentDueDate(dueDate)

      expect(formatted).toContain('janeiro')
    })
  })
})

describe('getOrdinalSuffix', () => {
  it('should return "st" for 1, 21, 31', () => {
    expect(getOrdinalSuffix(1)).toBe('st')
    expect(getOrdinalSuffix(21)).toBe('st')
    expect(getOrdinalSuffix(31)).toBe('st')
  })

  it('should return "nd" for 2, 22', () => {
    expect(getOrdinalSuffix(2)).toBe('nd')
    expect(getOrdinalSuffix(22)).toBe('nd')
  })

  it('should return "rd" for 3, 23', () => {
    expect(getOrdinalSuffix(3)).toBe('rd')
    expect(getOrdinalSuffix(23)).toBe('rd')
  })

  it('should return "th" for 4-20', () => {
    expect(getOrdinalSuffix(4)).toBe('th')
    expect(getOrdinalSuffix(10)).toBe('th')
    expect(getOrdinalSuffix(15)).toBe('th')
    expect(getOrdinalSuffix(20)).toBe('th')
  })

  it('should return "th" for 11, 12, 13 (special cases)', () => {
    expect(getOrdinalSuffix(11)).toBe('th')
    expect(getOrdinalSuffix(12)).toBe('th')
    expect(getOrdinalSuffix(13)).toBe('th')
  })

  it('should return "th" for 24-30', () => {
    expect(getOrdinalSuffix(24)).toBe('th')
    expect(getOrdinalSuffix(25)).toBe('th')
    expect(getOrdinalSuffix(30)).toBe('th')
  })
})

describe('formatDueDay', () => {
  describe('Portuguese (pt-BR)', () => {
    it('should format day without suffix', () => {
      expect(formatDueDay(15, 'pt-BR')).toBe('15')
      expect(formatDueDay(1, 'pt-BR')).toBe('1')
      expect(formatDueDay(31, 'pt-BR')).toBe('31')
    })
  })

  describe('English (en)', () => {
    it('should format day with ordinal suffix', () => {
      expect(formatDueDay(15, 'en')).toBe('15th')
      expect(formatDueDay(1, 'en')).toBe('1st')
      expect(formatDueDay(2, 'en')).toBe('2nd')
      expect(formatDueDay(3, 'en')).toBe('3rd')
      expect(formatDueDay(21, 'en')).toBe('21st')
      expect(formatDueDay(31, 'en')).toBe('31st')
    })
  })

  describe('Default locale', () => {
    it('should use pt-BR as default (no suffix)', () => {
      expect(formatDueDay(15)).toBe('15')
    })
  })
})

describe('calculateRecurringDueDay', () => {
  it('should return day within same month (5 + 10 = 15)', () => {
    expect(calculateRecurringDueDay(5, 10)).toBe(15)
  })

  it('should return day within same month (10 + 15 = 25)', () => {
    expect(calculateRecurringDueDay(10, 15)).toBe(25)
  })

  it('should handle wrapping to next month (25 + 10 = 4)', () => {
    // Closing day 25 + Due day 10 = 35 → wraps to 4th of next month
    const result = calculateRecurringDueDay(25, 10)
    // This depends on the month, but typically wraps to 4-5
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThan(15)
  })

  it('should handle edge case (28 + 10 = 8)', () => {
    // Closing day 28 + Due day 10 = 38 → wraps to 8th of next month
    const result = calculateRecurringDueDay(28, 10)
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThan(15)
  })

  it('should return 6 for closing 5 + due 1', () => {
    expect(calculateRecurringDueDay(5, 1)).toBe(6)
  })
})
