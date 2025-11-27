/**
 * Time manipulation utilities for testing time-based features
 *
 * These utilities provide deterministic time control for testing engagement system
 * features that rely on time progression (e.g., 14-day inactivity, 48-hour timeouts).
 *
 * @module time-helpers
 */

/**
 * Set up fake timers and mock the current time to a specific date
 *
 * This function should be called in beforeEach() to set up deterministic time for tests.
 * It configures Jest to use fake timers and sets the system time to the specified date.
 *
 * @param startDate - The date to set as "now". Defaults to current date if not specified
 * @returns The date that was set as the current time
 *
 * @example
 * ```typescript
 * beforeEach(() => {
 *   setupMockTime(new Date('2025-01-01T00:00:00Z'))
 * })
 *
 * it('sends goodbye after 14 days', async () => {
 *   // Test starts at 2025-01-01
 *   advanceTime(14) // Now it's 2025-01-15
 *   // Run scheduler and verify behavior
 * })
 * ```
 */
export function setupMockTime(startDate: Date = new Date()): Date {
  // Clear any existing fake timers first
  jest.useRealTimers()
  // Set up fresh fake timers
  jest.useFakeTimers()
  jest.setSystemTime(startDate)
  return startDate
}

/**
 * Mock Date.now() and new Date() to return a specific date
 *
 * Use this when you need to set the current time without using fake timers.
 *
 * @param date - The date to mock as "now"
 *
 * @example
 * ```typescript
 * it('timestamps use mocked time', () => {
 *   mockNow(new Date('2025-01-15T12:00:00Z'))
 *   const timestamp = new Date()
 *   expect(timestamp.toISOString()).toBe('2025-01-15T12:00:00.000Z')
 * })
 * ```
 */
export function mockNow(date: Date): void {
  jest.setSystemTime(date)
}

/**
 * Advance time by a specified number of days
 *
 * This function advances both Jest fake timers (for setTimeout/setInterval) and
 * the system time (for Date.now() and new Date()).
 *
 * IMPORTANT: You must call setupMockTime() or jest.useFakeTimers() before using this.
 *
 * @param days - Number of days to advance time forward
 * @returns The new current date after advancing time
 *
 * @example
 * ```typescript
 * beforeEach(() => {
 *   setupMockTime(new Date('2025-01-01'))
 * })
 *
 * it('sends goodbye after 14 days inactivity', async () => {
 *   const user = createMockEngagementState({ lastActivityAt: new Date() })
 *   await seedEngagementState(user)
 *
 *   advanceTime(13) // Day 13 - no goodbye yet
 *   await runDailyJob()
 *   expect(getMockMessages()).toHaveLength(0)
 *
 *   advanceTime(1) // Day 14 - goodbye sent
 *   await runDailyJob()
 *   expect(getMockMessages()).toHaveLength(1)
 * })
 * ```
 */
export function advanceTime(days: number): Date {
  const millisecondsPerDay = 24 * 60 * 60 * 1000
  const advanceMs = days * millisecondsPerDay
  const newTime = Date.now() + advanceMs

  // Update system time for Date.now() and new Date()
  jest.setSystemTime(newTime)

  // Advance timers for setTimeout/setInterval
  jest.advanceTimersByTime(advanceMs)

  return new Date(newTime)
}

/**
 * Reset Jest timers back to real time
 *
 * This function should be called in afterEach() to clean up fake timers and
 * restore normal time behavior for subsequent tests.
 *
 * @example
 * ```typescript
 * afterEach(() => {
 *   resetClock()
 * })
 * ```
 */
export function resetClock(): void {
  jest.useRealTimers()
}
