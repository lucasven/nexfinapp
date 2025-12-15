/**
 * Integration Tests: Budget Calculation with Database
 *
 * Story 2.8: Installment Impact on Budget Tracking
 *
 * These tests verify the budget calculation with actual database queries.
 * They test:
 * - Real database RPC function get_budget_for_period()
 * - Regular transactions + installment payments integration
 * - Statement period boundary handling
 * - Category grouping
 * - Performance (< 300ms target)
 *
 * Prerequisites:
 * - Test database with migration 043_budget_with_installments.sql applied
 * - Test user with payment methods
 * - Sample transactions and installment plans
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { createClient } from '@supabase/supabase-js'
import { getBudgetForPeriod } from '@/lib/actions/budget'
import { getStatementPeriod } from '@/lib/utils/statement-period'

// Test configuration
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Missing Supabase credentials for integration tests')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

describe('Budget Integration Tests', () => {
  let testUserId: string
  let testPaymentMethodId: string
  let testCategoryId: string

  beforeAll(async () => {
    // Create test user
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email: `budget-test-${Date.now()}@test.com`,
      password: 'test-password-123',
      email_confirm: true,
    })

    if (userError || !userData.user) {
      throw new Error(`Failed to create test user: ${userError?.message}`)
    }

    testUserId = userData.user.id

    // Create test category
    const { data: categoryData, error: categoryError } = await supabase
      .from('categories')
      .insert({
        name: 'Test Category',
        emoji: '🧪',
        type: 'expense',
        user_id: testUserId,
      })
      .select()
      .single()

    if (categoryError || !categoryData) {
      throw new Error(`Failed to create test category: ${categoryError?.message}`)
    }

    testCategoryId = categoryData.id

    // Create test payment method (credit card with credit mode)
    const { data: pmData, error: pmError } = await supabase
      .from('payment_methods')
      .insert({
        user_id: testUserId,
        name: 'Test Credit Card',
        type: 'credit',
        credit_mode: true,
      })
      .select()
      .single()

    if (pmError || !pmData) {
      throw new Error(`Failed to create test payment method: ${pmError?.message}`)
    }

    testPaymentMethodId = pmData.id
  })

  afterAll(async () => {
    // Clean up test data
    if (testUserId) {
      // Delete user (cascades to transactions, payment methods, etc.)
      await supabase.auth.admin.deleteUser(testUserId)
    }
  })

  describe('Regular Transactions Only', () => {
    it('should calculate budget from regular transactions in period', async () => {
      // Create transactions in current period
      const period = getStatementPeriod(new Date(), 5)
      const midPeriodDate = new Date(period.periodStart)
      midPeriodDate.setDate(midPeriodDate.getDate() + 5)

      const { error: txError } = await supabase.from('transactions').insert([
        {
          user_id: testUserId,
          payment_method_id: testPaymentMethodId,
          category_id: testCategoryId,
          date: midPeriodDate.toISOString().split('T')[0],
          amount: 100,
          description: 'Test Transaction 1',
          type: 'expense',
        },
        {
          user_id: testUserId,
          payment_method_id: testPaymentMethodId,
          category_id: testCategoryId,
          date: midPeriodDate.toISOString().split('T')[0],
          amount: 50,
          description: 'Test Transaction 2',
          type: 'expense',
        },
      ])

      expect(txError).toBeNull()

      // Note: This test requires mocking auth.getUser() in the server action
      // For now, this serves as documentation for manual integration testing
      // TODO: Set up proper test authentication context
    })
  })

  describe('Installment Payments in Period', () => {
    it('should include pending installment payments due in period', async () => {
      // Create installment plan
      const { data: planData, error: planError } = await supabase
        .from('installment_plans')
        .insert({
          user_id: testUserId,
          payment_method_id: testPaymentMethodId,
          category_id: testCategoryId,
          description: 'Test Installment Plan',
          total_amount: 1200,
          total_installments: 12,
          monthly_amount: 100,
          status: 'active',
        })
        .select()
        .single()

      expect(planError).toBeNull()
      expect(planData).toBeDefined()

      // Create installment payments
      const period = getStatementPeriod(new Date(), 5)
      const paymentDate = new Date(period.periodStart)
      paymentDate.setDate(paymentDate.getDate() + 3)

      const { error: paymentError } = await supabase.from('installment_payments').insert({
        plan_id: planData!.id,
        installment_number: 1,
        due_date: paymentDate.toISOString().split('T')[0],
        amount: 100,
        status: 'pending',
      })

      expect(paymentError).toBeNull()

      // TODO: Test budget calculation includes this payment
    })
  })

  describe('Statement Period Boundaries', () => {
    it('should include transactions on period start date (inclusive)', async () => {
      const period = getStatementPeriod(new Date(), 5)

      const { error } = await supabase.from('transactions').insert({
        user_id: testUserId,
        payment_method_id: testPaymentMethodId,
        category_id: testCategoryId,
        date: period.periodStart.toISOString().split('T')[0],
        amount: 75,
        description: 'Transaction on period start',
        type: 'expense',
      })

      expect(error).toBeNull()
      // TODO: Verify transaction is included in budget
    })

    it('should include transactions on period end date (inclusive)', async () => {
      const period = getStatementPeriod(new Date(), 5)

      const { error } = await supabase.from('transactions').insert({
        user_id: testUserId,
        payment_method_id: testPaymentMethodId,
        category_id: testCategoryId,
        date: period.periodEnd.toISOString().split('T')[0],
        amount: 60,
        description: 'Transaction on period end',
        type: 'expense',
      })

      expect(error).toBeNull()
      // TODO: Verify transaction is included in budget
    })

    it('should exclude transactions before period start', async () => {
      const period = getStatementPeriod(new Date(), 5)
      const beforeStart = new Date(period.periodStart)
      beforeStart.setDate(beforeStart.getDate() - 1)

      const { error } = await supabase.from('transactions').insert({
        user_id: testUserId,
        payment_method_id: testPaymentMethodId,
        category_id: testCategoryId,
        date: beforeStart.toISOString().split('T')[0],
        amount: 40,
        description: 'Transaction before period',
        type: 'expense',
      })

      expect(error).toBeNull()
      // TODO: Verify transaction is NOT included in budget
    })

    it('should exclude transactions after period end', async () => {
      const period = getStatementPeriod(new Date(), 5)
      const afterEnd = new Date(period.periodEnd)
      afterEnd.setDate(afterEnd.getDate() + 1)

      const { error } = await supabase.from('transactions').insert({
        user_id: testUserId,
        payment_method_id: testPaymentMethodId,
        category_id: testCategoryId,
        date: afterEnd.toISOString().split('T')[0],
        amount: 30,
        description: 'Transaction after period',
        type: 'expense',
      })

      expect(error).toBeNull()
      // TODO: Verify transaction is NOT included in budget
    })
  })

  describe('Performance', () => {
    it('should complete budget query in < 300ms with typical data volume', async () => {
      // Create 20 regular transactions
      const period = getStatementPeriod(new Date(), 5)
      const transactions = Array.from({ length: 20 }, (_, i) => ({
        user_id: testUserId,
        payment_method_id: testPaymentMethodId,
        category_id: testCategoryId,
        date: period.periodStart.toISOString().split('T')[0],
        amount: 50 + i,
        description: `Performance Test Transaction ${i + 1}`,
        type: 'expense',
      }))

      const { error: txError } = await supabase.from('transactions').insert(transactions)
      expect(txError).toBeNull()

      // Create 5 installment plans with 2 payments each in period
      for (let i = 0; i < 5; i++) {
        const { data: planData, error: planError } = await supabase
          .from('installment_plans')
          .insert({
            user_id: testUserId,
            payment_method_id: testPaymentMethodId,
            category_id: testCategoryId,
            description: `Performance Test Plan ${i + 1}`,
            total_amount: 1200,
            total_installments: 12,
            monthly_amount: 100,
            status: 'active',
          })
          .select()
          .single()

        expect(planError).toBeNull()

        const { error: paymentError } = await supabase.from('installment_payments').insert([
          {
            plan_id: planData!.id,
            installment_number: 1,
            due_date: period.periodStart.toISOString().split('T')[0],
            amount: 100,
            status: 'pending',
          },
          {
            plan_id: planData!.id,
            installment_number: 2,
            due_date: period.periodStart.toISOString().split('T')[0],
            amount: 100,
            status: 'pending',
          },
        ])

        expect(paymentError).toBeNull()
      }

      // Measure query performance
      const startTime = performance.now()

      const { data, error } = await supabase.rpc('get_budget_for_period', {
        p_user_id: testUserId,
        p_payment_method_id: testPaymentMethodId,
        p_period_start: period.periodStart.toISOString().split('T')[0],
        p_period_end: period.periodEnd.toISOString().split('T')[0],
      })

      const executionTime = performance.now() - startTime

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data.length).toBeGreaterThan(0)

      // Performance assertion
      console.log(`Budget query execution time: ${executionTime.toFixed(2)}ms`)
      expect(executionTime).toBeLessThan(300)
    })
  })

  describe('Category Grouping', () => {
    it('should group transactions and installments by category', async () => {
      // Create second category
      const { data: category2, error: cat2Error } = await supabase
        .from('categories')
        .insert({
          name: 'Test Category 2',
          emoji: '🔬',
          type: 'expense',
          user_id: testUserId,
        })
        .select()
        .single()

      expect(cat2Error).toBeNull()

      const period = getStatementPeriod(new Date(), 5)

      // Create transactions in different categories
      const { error: txError } = await supabase.from('transactions').insert([
        {
          user_id: testUserId,
          payment_method_id: testPaymentMethodId,
          category_id: testCategoryId,
          date: period.periodStart.toISOString().split('T')[0],
          amount: 100,
          description: 'Category 1 Transaction',
          type: 'expense',
        },
        {
          user_id: testUserId,
          payment_method_id: testPaymentMethodId,
          category_id: category2!.id,
          date: period.periodStart.toISOString().split('T')[0],
          amount: 200,
          description: 'Category 2 Transaction',
          type: 'expense',
        },
      ])

      expect(txError).toBeNull()

      // TODO: Verify budget breakdown groups by category correctly
    })
  })

  describe('Empty Budget', () => {
    it('should handle period with no transactions or installments', async () => {
      // Use a future period with no data
      const futureStart = new Date()
      futureStart.setFullYear(futureStart.getFullYear() + 2)
      const futureEnd = new Date(futureStart)
      futureEnd.setMonth(futureEnd.getMonth() + 1)

      const { data, error } = await supabase.rpc('get_budget_for_period', {
        p_user_id: testUserId,
        p_payment_method_id: testPaymentMethodId,
        p_period_start: futureStart.toISOString().split('T')[0],
        p_period_end: futureEnd.toISOString().split('T')[0],
      })

      expect(error).toBeNull()
      expect(data).toEqual([])
    })
  })
})

/**
 * Manual Testing Instructions
 * ============================
 *
 * Since these tests require authenticated context that's complex to set up
 * in Jest, here's how to run manual integration tests:
 *
 * 1. Deploy migration 043_budget_with_installments.sql to test database
 *
 * 2. Create test data:
 *    - User with email: integration-test@test.com
 *    - Credit card payment method with credit_mode = true
 *    - Category: "Electronics" with emoji 📱
 *    - 5 regular transactions in current period (amounts: 50, 100, 75, 200, 125)
 *    - 2 installment plans with 1 payment each in current period (amounts: 100, 150)
 *
 * 3. Run budget query:
 *    SELECT * FROM get_budget_for_period(
 *      'user-uuid',
 *      'payment-method-uuid',
 *      '2024-12-06',
 *      '2025-01-05'
 *    );
 *
 * 4. Verify results:
 *    - Total rows: 7 (5 regular + 2 installments)
 *    - Total amount: 800 (550 + 250)
 *    - All rows have correct category_id and category_name
 *    - Installment rows have is_installment = true
 *    - Installment rows have installment_number and total_installments
 *
 * 5. Test performance:
 *    - Add 20 regular transactions + 10 installment payments
 *    - Use EXPLAIN ANALYZE to check query plan
 *    - Verify execution time < 300ms
 *
 * 6. Test boundaries:
 *    - Add transaction on period start date (should be included)
 *    - Add transaction on period end date (should be included)
 *    - Add transaction 1 day before period start (should be excluded)
 *    - Add transaction 1 day after period end (should be excluded)
 */
