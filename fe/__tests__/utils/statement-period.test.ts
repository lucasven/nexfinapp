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
      const currentDate = new Date('2024-12-03')
      const closingDay = 5
      const period = getStatementPeriod(currentDate, closingDay)

      expect(period.periodStart).toEqual(new Date('2024-11-06'))
      expect(period.periodEnd).toEqual(new Date('2024-12-05'))
    })

    it('should handle January correctly (year boundary)', () => {
      // Current date: Jan 3, 2025 (before closing day 5)
      // Expected period: Dec 6, 2024 - Jan 5, 2025
      const currentDate = new Date('2025-01-03')
      const closingDay = 5
      const period = getStatementPeriod(currentDate, closingDay)

      expect(period.periodStart).toEqual(new Date('2024-12-06'))
      expect(period.periodEnd).toEqual(new Date('2025-01-05'))
    })
  })

  describe('After closing day', () => {
    it('should return period ending on closing day of next month', () => {
      // Current date: Dec 10, 2024 (after closing day 5)
      // Expected period: Dec 6, 2024 - Jan 5, 2025
      const currentDate = new Date('2024-12-10')
      const closingDay = 5
      const period = getStatementPeriod(currentDate, closingDay)

      expect(period.periodStart).toEqual(new Date('2024-12-06'))
      expect(period.periodEnd).toEqual(new Date('2025-01-05'))
    })

    it('should handle December correctly (year boundary)', () => {
      // Current date: Dec 25, 2024 (after closing day 5)
      // Expected period: Dec 6, 2024 - Jan 5, 2025
      const currentDate = new Date('2024-12-25')
      const closingDay = 5
      const period = getStatementPeriod(currentDate, closingDay)

      expect(period.periodStart).toEqual(new Date('2024-12-06'))
      expect(period.periodEnd).toEqual(new Date('2025-01-05'))
    })
  })

  describe('On closing day', () => {
    it('should return period ending on closing day (inclusive)', () => {
      // Current date: Dec 5, 2024 (on closing day 5)
      // Expected period: Nov 6, 2024 - Dec 5, 2024
      const currentDate = new Date('2024-12-05')
      const closingDay = 5
      const period = getStatementPeriod(currentDate, closingDay)

      expect(period.periodStart).toEqual(new Date('2024-11-06'))
      expect(period.periodEnd).toEqual(new Date('2024-12-05'))
    })
  })

  describe('Month boundaries', () => {
    it('should handle end of month (Dec 31)', () => {
      // Current date: Dec 31, 2024 (after closing day 5)
      // Expected period: Dec 6, 2024 - Jan 5, 2025
      const currentDate = new Date('2024-12-31')
      const closingDay = 5
      const period = getStatementPeriod(currentDate, closingDay)

      expect(period.periodStart).toEqual(new Date('2024-12-06'))
      expect(period.periodEnd).toEqual(new Date('2025-01-05'))
    })

    it('should handle start of month (Jan 1)', () => {
      // Current date: Jan 1, 2025 (before closing day 5)
      // Expected period: Dec 6, 2024 - Jan 5, 2025
      const currentDate = new Date('2025-01-01')
      const closingDay = 5
      const period = getStatementPeriod(currentDate, closingDay)

      expect(period.periodStart).toEqual(new Date('2024-12-06'))
      expect(period.periodEnd).toEqual(new Date('2025-01-05'))
    })
  })

  describe('Different closing days', () => {
    it('should work with closing day 1', () => {
      // Current date: Dec 10, 2024 (after closing day 1)
      // Expected period: Dec 2, 2024 - Jan 1, 2025
      const currentDate = new Date('2024-12-10')
      const closingDay = 1
      const period = getStatementPeriod(currentDate, closingDay)

      expect(period.periodStart).toEqual(new Date('2024-12-02'))
      expect(period.periodEnd).toEqual(new Date('2025-01-01'))
    })

    it('should work with closing day 15', () => {
      // Current date: Dec 10, 2024 (before closing day 15)
      // Expected period: Nov 16, 2024 - Dec 15, 2024
      const currentDate = new Date('2024-12-10')
      const closingDay = 15
      const period = getStatementPeriod(currentDate, closingDay)

      expect(period.periodStart).toEqual(new Date('2024-11-16'))
      expect(period.periodEnd).toEqual(new Date('2024-12-15'))
    })

    it('should work with closing day 25', () => {
      // Current date: Dec 20, 2024 (before closing day 25)
      // Expected period: Nov 26, 2024 - Dec 25, 2024
      const currentDate = new Date('2024-12-20')
      const closingDay = 25
      const period = getStatementPeriod(currentDate, closingDay)

      expect(period.periodStart).toEqual(new Date('2024-11-26'))
      expect(period.periodEnd).toEqual(new Date('2024-12-25'))
    })
  })

  describe('February (leap year handling)', () => {
    it('should handle February in non-leap year', () => {
      // Current date: Feb 10, 2025 (after closing day 5)
      // Expected period: Feb 6, 2025 - Mar 5, 2025
      const currentDate = new Date('2025-02-10')
      const closingDay = 5
      const period = getStatementPeriod(currentDate, closingDay)

      expect(period.periodStart).toEqual(new Date('2025-02-06'))
      expect(period.periodEnd).toEqual(new Date('2025-03-05'))
    })

    it('should handle February in leap year', () => {
      // Current date: Feb 10, 2024 (after closing day 5)
      // Expected period: Feb 6, 2024 - Mar 5, 2024
      const currentDate = new Date('2024-02-10')
      const closingDay = 5
      const period = getStatementPeriod(currentDate, closingDay)

      expect(period.periodStart).toEqual(new Date('2024-02-06'))
      expect(period.periodEnd).toEqual(new Date('2024-03-05'))
    })
  })

  describe('Default closing day', () => {
    it('should use closing day 5 as default', () => {
      // Current date: Dec 10, 2024 (no closingDay specified)
      // Expected period: Dec 6, 2024 - Jan 5, 2025 (using default 5)
      const currentDate = new Date('2024-12-10')
      const period = getStatementPeriod(currentDate)

      expect(period.periodStart).toEqual(new Date('2024-12-06'))
      expect(period.periodEnd).toEqual(new Date('2025-01-05'))
    })
  })
})

describe('formatStatementPeriod', () => {
  describe('Portuguese (pt-BR)', () => {
    it('should format period in same year', () => {
      const period: StatementPeriod = {
        periodStart: new Date('2024-11-06'),
        periodEnd: new Date('2024-12-05'),
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
        periodStart: new Date('2024-12-06'),
        periodEnd: new Date('2025-01-05'),
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
        periodStart: new Date('2024-11-06'),
        periodEnd: new Date('2024-12-05'),
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
        periodStart: new Date('2024-12-06'),
        periodEnd: new Date('2025-01-05'),
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
        periodStart: new Date('2024-11-06'),
        periodEnd: new Date('2024-12-05'),
      }
      const formatted = formatStatementPeriod(period)

      expect(formatted).toContain('novembro')
      expect(formatted).toContain('dezembro')
    })
  })
})

describe('isDateInPeriod', () => {
  const period: StatementPeriod = {
    periodStart: new Date('2024-12-06'),
    periodEnd: new Date('2025-01-05'),
  }

  it('should return true for date within period', () => {
    const date = new Date('2024-12-15')
    expect(isDateInPeriod(date, period)).toBe(true)
  })

  it('should return true for period start date (inclusive)', () => {
    const date = new Date('2024-12-06')
    expect(isDateInPeriod(date, period)).toBe(true)
  })

  it('should return true for period end date (inclusive)', () => {
    const date = new Date('2025-01-05')
    expect(isDateInPeriod(date, period)).toBe(true)
  })

  it('should return false for date before period', () => {
    const date = new Date('2024-12-05')
    expect(isDateInPeriod(date, period)).toBe(false)
  })

  it('should return false for date after period', () => {
    const date = new Date('2025-01-06')
    expect(isDateInPeriod(date, period)).toBe(false)
  })

  it('should handle year boundary correctly', () => {
    const dateInPeriod = new Date('2024-12-31')
    expect(isDateInPeriod(dateInPeriod, period)).toBe(true)
  })
})
