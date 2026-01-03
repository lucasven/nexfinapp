/**
 * Unit Tests: Statement Period Calculation
 *
 * Story 2.8: Installment Impact on Budget Tracking
 *
 * Tests the statement period utility functions including:
 * - Period calculation before/after closing day
 * - Month boundaries
 * - Year boundaries
 * - Leap years
 * - Edge cases
 */

import { describe, it, expect } from '@jest/globals'
import {
  getStatementPeriod,
  formatStatementPeriod,
  isDateInPeriod,
  type StatementPeriod,
} from '@/lib/utils/statement-period'

describe('getStatementPeriod', () => {
  describe('Before closing day', () => {
    it('should return period ending on closing day of current month', () => {
      // Current date: Dec 3, 2024 (before closing day 5)
      // Expected period: Nov 6, 2024 - Dec 5, 2024
      const currentDate = new Date(2024, 11, 3) // Dec 3, 2024
      const closingDay = 5
      const period = getStatementPeriod(currentDate, closingDay)

      expect(period.periodStart.getDate()).toBe(6)
      expect(period.periodStart.getMonth()).toBe(10) // Nov = 10
      expect(period.periodEnd.getDate()).toBe(5)
      expect(period.periodEnd.getMonth()).toBe(11) // Dec = 11
    })

    it('should handle January correctly (year boundary)', () => {
      // Current date: Jan 3, 2025 (before closing day 5)
      // Expected period: Dec 6, 2024 - Jan 5, 2025
      const currentDate = new Date(2025, 0, 3) // Jan 3, 2025
      const closingDay = 5
      const period = getStatementPeriod(currentDate, closingDay)

      expect(period.periodStart.getDate()).toBe(6)
      expect(period.periodStart.getMonth()).toBe(11) // Dec = 11
      expect(period.periodStart.getFullYear()).toBe(2024)
      expect(period.periodEnd.getDate()).toBe(5)
      expect(period.periodEnd.getMonth()).toBe(0) // Jan = 0
      expect(period.periodEnd.getFullYear()).toBe(2025)
    })
  })

  describe('After closing day', () => {
    it('should return period ending on closing day of next month', () => {
      // Current date: Dec 10, 2024 (after closing day 5)
      // Expected period: Dec 6, 2024 - Jan 5, 2025
      const currentDate = new Date(2024, 11, 10) // Dec 10, 2024
      const closingDay = 5
      const period = getStatementPeriod(currentDate, closingDay)

      expect(period.periodStart.getDate()).toBe(6)
      expect(period.periodStart.getMonth()).toBe(11) // Dec = 11
      expect(period.periodEnd.getDate()).toBe(5)
      expect(period.periodEnd.getMonth()).toBe(0) // Jan = 0
      expect(period.periodEnd.getFullYear()).toBe(2025)
    })

    it('should handle December correctly (year boundary)', () => {
      // Current date: Dec 25, 2024 (after closing day 5)
      // Expected period: Dec 6, 2024 - Jan 5, 2025
      const currentDate = new Date(2024, 11, 25) // Dec 25, 2024
      const closingDay = 5
      const period = getStatementPeriod(currentDate, closingDay)

      expect(period.periodStart.getDate()).toBe(6)
      expect(period.periodStart.getMonth()).toBe(11) // Dec = 11
      expect(period.periodEnd.getDate()).toBe(5)
      expect(period.periodEnd.getMonth()).toBe(0) // Jan = 0
      expect(period.periodEnd.getFullYear()).toBe(2025)
    })
  })

  describe('On closing day', () => {
    it('should return period ending on closing day (inclusive)', () => {
      // Current date: Dec 5, 2024 (on closing day 5)
      // Expected period: Nov 6, 2024 - Dec 5, 2024
      const currentDate = new Date(2024, 11, 5) // Dec 5, 2024
      const closingDay = 5
      const period = getStatementPeriod(currentDate, closingDay)

      expect(period.periodStart.getDate()).toBe(6)
      expect(period.periodStart.getMonth()).toBe(10) // Nov = 10
      expect(period.periodEnd.getDate()).toBe(5)
      expect(period.periodEnd.getMonth()).toBe(11) // Dec = 11
    })
  })

  describe('Month boundaries', () => {
    it('should handle end of month (Dec 31)', () => {
      // Current date: Dec 31, 2024 (after closing day 5)
      // Expected period: Dec 6, 2024 - Jan 5, 2025
      const currentDate = new Date(2024, 11, 31) // Dec 31, 2024
      const closingDay = 5
      const period = getStatementPeriod(currentDate, closingDay)

      expect(period.periodStart.getDate()).toBe(6)
      expect(period.periodStart.getMonth()).toBe(11) // Dec = 11
      expect(period.periodEnd.getDate()).toBe(5)
      expect(period.periodEnd.getMonth()).toBe(0) // Jan = 0
      expect(period.periodEnd.getFullYear()).toBe(2025)
    })

    it('should handle start of month (Jan 1)', () => {
      // Current date: Jan 1, 2025 (before closing day 5)
      // Expected period: Dec 6, 2024 - Jan 5, 2025
      const currentDate = new Date(2025, 0, 1) // Jan 1, 2025
      const closingDay = 5
      const period = getStatementPeriod(currentDate, closingDay)

      expect(period.periodStart.getDate()).toBe(6)
      expect(period.periodStart.getMonth()).toBe(11) // Dec = 11
      expect(period.periodStart.getFullYear()).toBe(2024)
      expect(period.periodEnd.getDate()).toBe(5)
      expect(period.periodEnd.getMonth()).toBe(0) // Jan = 0
    })
  })

  describe('Different closing days', () => {
    it('should work with closing day 1', () => {
      // Current date: Dec 10, 2024 (after closing day 1)
      // Expected period: Dec 2, 2024 - Jan 1, 2025
      const currentDate = new Date(2024, 11, 10) // Dec 10, 2024
      const closingDay = 1
      const period = getStatementPeriod(currentDate, closingDay)

      expect(period.periodStart.getDate()).toBe(2)
      expect(period.periodStart.getMonth()).toBe(11) // Dec = 11
      expect(period.periodEnd.getDate()).toBe(1)
      expect(period.periodEnd.getMonth()).toBe(0) // Jan = 0
      expect(period.periodEnd.getFullYear()).toBe(2025)
    })

    it('should work with closing day 15', () => {
      // Current date: Dec 10, 2024 (before closing day 15)
      // Expected period: Nov 16, 2024 - Dec 15, 2024
      const currentDate = new Date(2024, 11, 10) // Dec 10, 2024
      const closingDay = 15
      const period = getStatementPeriod(currentDate, closingDay)

      expect(period.periodStart.getDate()).toBe(16)
      expect(period.periodStart.getMonth()).toBe(10) // Nov = 10
      expect(period.periodEnd.getDate()).toBe(15)
      expect(period.periodEnd.getMonth()).toBe(11) // Dec = 11
    })

    it('should work with closing day 25', () => {
      // Current date: Dec 20, 2024 (before closing day 25)
      // Expected period: Nov 26, 2024 - Dec 25, 2024
      const currentDate = new Date(2024, 11, 20) // Dec 20, 2024
      const closingDay = 25
      const period = getStatementPeriod(currentDate, closingDay)

      expect(period.periodStart.getDate()).toBe(26)
      expect(period.periodStart.getMonth()).toBe(10) // Nov = 10
      expect(period.periodEnd.getDate()).toBe(25)
      expect(period.periodEnd.getMonth()).toBe(11) // Dec = 11
    })
  })

  describe('February (leap year handling)', () => {
    it('should handle February in non-leap year', () => {
      // Current date: Feb 10, 2025 (after closing day 5)
      // Expected period: Feb 6, 2025 - Mar 5, 2025
      const currentDate = new Date(2025, 1, 10) // Feb 10, 2025
      const closingDay = 5
      const period = getStatementPeriod(currentDate, closingDay)

      expect(period.periodStart.getDate()).toBe(6)
      expect(period.periodStart.getMonth()).toBe(1) // Feb = 1
      expect(period.periodEnd.getDate()).toBe(5)
      expect(period.periodEnd.getMonth()).toBe(2) // Mar = 2
    })

    it('should handle February in leap year', () => {
      // Current date: Feb 10, 2024 (after closing day 5)
      // Expected period: Feb 6, 2024 - Mar 5, 2024
      const currentDate = new Date(2024, 1, 10) // Feb 10, 2024
      const closingDay = 5
      const period = getStatementPeriod(currentDate, closingDay)

      expect(period.periodStart.getDate()).toBe(6)
      expect(period.periodStart.getMonth()).toBe(1) // Feb = 1
      expect(period.periodEnd.getDate()).toBe(5)
      expect(period.periodEnd.getMonth()).toBe(2) // Mar = 2
    })
  })

  describe('Default closing day', () => {
    it('should use closing day 5 as default', () => {
      // Current date: Dec 10, 2024 (no closingDay specified)
      // Expected period: Dec 6, 2024 - Jan 5, 2025 (using default 5)
      const currentDate = new Date(2024, 11, 10) // Dec 10, 2024
      const period = getStatementPeriod(currentDate)

      expect(period.periodStart.getDate()).toBe(6)
      expect(period.periodStart.getMonth()).toBe(11) // Dec = 11
      expect(period.periodEnd.getDate()).toBe(5)
      expect(period.periodEnd.getMonth()).toBe(0) // Jan = 0
      expect(period.periodEnd.getFullYear()).toBe(2025)
    })
  })
})

describe('formatStatementPeriod', () => {
  describe('Portuguese (pt-BR)', () => {
    it('should format period in same year', () => {
      const period: StatementPeriod = {
        periodStart: new Date(2024, 10, 6), // Nov 6, 2024
        periodEnd: new Date(2024, 11, 5),   // Dec 5, 2024
      }
      const formatted = formatStatementPeriod(period, 'pt-BR')

      expect(formatted).toContain('6')
      expect(formatted).toContain('novembro')
      expect(formatted).toContain('5')
      expect(formatted).toContain('dezembro')
      expect(formatted).toContain('2024')
    })

    it('should format period across years', () => {
      const period: StatementPeriod = {
        periodStart: new Date(2024, 11, 6), // Dec 6, 2024
        periodEnd: new Date(2025, 0, 5),    // Jan 5, 2025
      }
      const formatted = formatStatementPeriod(period, 'pt-BR')

      expect(formatted).toContain('6')
      expect(formatted).toContain('dezembro')
      expect(formatted).toContain('2024')
      expect(formatted).toContain('5')
      expect(formatted).toContain('janeiro')
      expect(formatted).toContain('2025')
    })
  })

  describe('English (en)', () => {
    it('should format period in same year', () => {
      const period: StatementPeriod = {
        periodStart: new Date(2024, 10, 6), // Nov 6, 2024
        periodEnd: new Date(2024, 11, 5),   // Dec 5, 2024
      }
      const formatted = formatStatementPeriod(period, 'en')

      expect(formatted).toContain('November')
      expect(formatted).toContain('6')
      expect(formatted).toContain('December')
      expect(formatted).toContain('5')
      expect(formatted).toContain('2024')
    })

    it('should format period across years', () => {
      const period: StatementPeriod = {
        periodStart: new Date(2024, 11, 6), // Dec 6, 2024
        periodEnd: new Date(2025, 0, 5),    // Jan 5, 2025
      }
      const formatted = formatStatementPeriod(period, 'en')

      expect(formatted).toContain('December')
      expect(formatted).toContain('6')
      expect(formatted).toContain('2024')
      expect(formatted).toContain('January')
      expect(formatted).toContain('5')
      expect(formatted).toContain('2025')
    })
  })

  describe('Default locale', () => {
    it('should use pt-BR as default locale', () => {
      const period: StatementPeriod = {
        periodStart: new Date(2024, 10, 6), // Nov 6, 2024
        periodEnd: new Date(2024, 11, 5),   // Dec 5, 2024
      }
      const formatted = formatStatementPeriod(period)

      expect(formatted).toContain('novembro')
      expect(formatted).toContain('dezembro')
    })
  })
})

describe('isDateInPeriod', () => {
  const period: StatementPeriod = {
    periodStart: new Date(2024, 11, 6),  // Dec 6, 2024
    periodEnd: new Date(2025, 0, 5),     // Jan 5, 2025
  }

  it('should return true for date within period', () => {
    const date = new Date(2024, 11, 15) // Dec 15, 2024
    expect(isDateInPeriod(date, period)).toBe(true)
  })

  it('should return true for period start date (inclusive)', () => {
    const date = new Date(2024, 11, 6) // Dec 6, 2024
    expect(isDateInPeriod(date, period)).toBe(true)
  })

  it('should return true for period end date (inclusive)', () => {
    const date = new Date(2025, 0, 5) // Jan 5, 2025
    expect(isDateInPeriod(date, period)).toBe(true)
  })

  it('should return false for date before period', () => {
    const date = new Date(2024, 11, 5) // Dec 5, 2024
    expect(isDateInPeriod(date, period)).toBe(false)
  })

  it('should return false for date after period', () => {
    const date = new Date(2025, 0, 6) // Jan 6, 2025
    expect(isDateInPeriod(date, period)).toBe(false)
  })

  it('should handle year boundary correctly', () => {
    const dateInPeriod = new Date(2024, 11, 31) // Dec 31, 2024
    expect(isDateInPeriod(dateInPeriod, period)).toBe(true)
  })
})
