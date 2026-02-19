import { test, expect, type Page } from '@playwright/test'

/**
 * Auto-Pay Recurring Transactions E2E Tests (PR #34)
 *
 * Tests the auto_pay toggle in recurring transactions UI
 * and verifies database state for the auto-payment flow.
 *
 * Test user: dev@example.com / password123
 * Database: Supabase local (100.81.72.21:54322)
 */

const TEST_USER = {
  email: 'dev@example.com',
  password: 'password123',
}

const LOCALE = 'pt-br'

// Database connection for verification
const DB_CONFIG = {
  host: '100.81.72.21',
  port: 54322,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
}

async function getDbClient() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Client } = require('pg')
  const client = new Client(DB_CONFIG)
  await client.connect()
  return client
}

async function login(page: Page) {
  await page.goto(`/${LOCALE}/auth/login`)
  await page.getByRole('textbox', { name: 'E-mail' }).fill(TEST_USER.email)
  await page.getByRole('textbox', { name: 'Senha' }).fill(TEST_USER.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  // Wait for auth - either redirect or session established
  await page.waitForTimeout(3000)
  await page.waitForLoadState('networkidle', { timeout: 15000 })
}

async function navigateToRecurring(page: Page) {
  await page.goto(`/${LOCALE}/recurring`, { timeout: 30000 })
  await page.waitForLoadState('networkidle', { timeout: 15000 })
}

// ============================================================================
// UI TESTS: Auto-Pay Toggle
// ============================================================================

test.describe('Auto-Pay Toggle - UI', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should show auto_pay toggle in new recurring transaction form', async ({ page }) => {
    await navigateToRecurring(page)

    // Open create dialog
    await page.getByRole('button', { name: /adicionar recorrente/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Verify auto_pay toggle exists with correct label
    await expect(page.getByText('Pagamento Automático')).toBeVisible()
    await expect(page.getByText('Criar transação automaticamente na data de vencimento')).toBeVisible()

    // Verify default is ON for new transactions
    const toggle = page.locator('#auto_pay')
    await expect(toggle).toBeChecked()
  })

  test('should create recurring income with auto_pay ON and verify in database', async ({ page }) => {
    await navigateToRecurring(page)

    // Open create dialog
    await page.getByRole('button', { name: /adicionar recorrente/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Fill form for income
    // Type selector
    await page.locator('#type').click()
    await page.getByRole('option', { name: /receita/i }).click()

    // Amount
    await page.locator('#amount').fill('500')

    // Category
    await page.locator('#category').click()
    await page.getByRole('option', { name: /salário/i }).click()

    // Day of month
    await page.locator('#day_of_month').click()
    await page.getByRole('option', { name: '15' }).click()

    // Verify auto_pay is ON
    const toggle = page.locator('#auto_pay')
    await expect(toggle).toBeChecked()

    // Submit
    await page.getByRole('button', { name: /salvar|criar|adicionar/i }).click()

    // Wait for dialog to close
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Verify in database
    const db = await getDbClient()
    try {
      const result = await db.query(
        `SELECT auto_pay, type, amount, day_of_month
         FROM recurring_transactions
         WHERE user_id = '00000000-0000-0000-0000-000000000001'
           AND amount = 500
           AND day_of_month = 15
         ORDER BY created_at DESC LIMIT 1`
      )
      expect(result.rows.length).toBe(1)
      expect(result.rows[0].auto_pay).toBe(true)
      expect(result.rows[0].type).toBe('income')
    } finally {
      await db.end()
    }
  })

  test('should create recurring income with auto_pay OFF and verify in database', async ({ page }) => {
    await navigateToRecurring(page)

    await page.getByRole('button', { name: /adicionar recorrente/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Fill form
    await page.locator('#type').click()
    await page.getByRole('option', { name: /receita/i }).click()

    await page.locator('#amount').fill('750')

    await page.locator('#category').click()
    await page.getByRole('option', { name: /salário/i }).click()

    await page.locator('#day_of_month').click()
    await page.getByRole('option', { name: '20' }).click()

    // Turn OFF auto_pay
    const toggle = page.locator('#auto_pay')
    await toggle.click()
    await expect(toggle).not.toBeChecked()

    // Submit
    await page.getByRole('button', { name: /salvar|criar|adicionar/i }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Verify in database
    const db = await getDbClient()
    try {
      const result = await db.query(
        `SELECT auto_pay, type, amount
         FROM recurring_transactions
         WHERE user_id = '00000000-0000-0000-0000-000000000001'
           AND amount = 750
           AND day_of_month = 20
         ORDER BY created_at DESC LIMIT 1`
      )
      expect(result.rows.length).toBe(1)
      expect(result.rows[0].auto_pay).toBe(false)
    } finally {
      await db.end()
    }
  })
})

// ============================================================================
// INTEGRATION TESTS: Auto-Pay Cron Simulation
// ============================================================================

test.describe('Auto-Pay Cron - Database Integration', () => {

  test('auto_pay=true: recurring payment due today should create transaction', async () => {
    const db = await getDbClient()
    const userId = '00000000-0000-0000-0000-000000000001'
    const today = new Date().toISOString().split('T')[0]

    try {
      // Get a category and payment method
      const { rows: [category] } = await db.query(
        "SELECT id FROM categories WHERE name = 'Salário' LIMIT 1"
      )
      const { rows: [paymentMethod] } = await db.query(
        `SELECT id FROM payment_methods WHERE user_id = '${userId}' LIMIT 1`
      )

      // Create recurring transaction with auto_pay=true
      const { rows: [recurring] } = await db.query(
        `INSERT INTO recurring_transactions (user_id, amount, type, category_id, description, payment_method, day_of_month, is_active, auto_pay)
         VALUES ($1, 1000, 'income', $2, 'Test Auto-Pay Income', 'PIX', $3, true, true)
         RETURNING id`,
        [userId, category.id, new Date().getDate()]
      )

      // Create recurring payment due today (simulating what the system generates)
      const { rows: [payment] } = await db.query(
        `INSERT INTO recurring_payments (recurring_transaction_id, user_id, due_date, is_paid)
         VALUES ($1, $2, $3, false)
         RETURNING id`,
        [recurring.id, userId, today]
      )

      // Simulate what the cron job does:
      // 1. Find due payments with auto_pay=true
      const { rows: duePayments } = await db.query(
        `SELECT rp.id, rp.due_date, rp.user_id,
                rt.amount, rt.type, rt.category_id, rt.description,
                rt.payment_method, rt.auto_pay
         FROM recurring_payments rp
         JOIN recurring_transactions rt ON rt.id = rp.recurring_transaction_id
         WHERE rp.due_date = $1
           AND rp.is_paid = false
           AND rt.auto_pay = true
           AND rp.id = $2`,
        [today, payment.id]
      )

      expect(duePayments.length).toBe(1)
      expect(duePayments[0].auto_pay).toBe(true)

      // 2. Resolve payment_method text -> payment_method_id UUID
      const { rows: resolvedPM } = await db.query(
        `SELECT id FROM payment_methods
         WHERE user_id = $1 AND LOWER(name) = LOWER($2)
         LIMIT 1`,
        [userId, duePayments[0].payment_method]
      )

      const paymentMethodId = resolvedPM.length > 0
        ? resolvedPM[0].id
        : paymentMethod.id  // fallback

      // 3. Create transaction (what the cron does)
      const { rows: [readableId] } = await db.query('SELECT generate_transaction_id()')

      const { rows: [transaction] } = await db.query(
        `INSERT INTO transactions (user_id, amount, type, category_id, description, payment_method_id, date, user_readable_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, amount, type, payment_method_id`,
        [userId, duePayments[0].amount, duePayments[0].type, duePayments[0].category_id,
         duePayments[0].description, paymentMethodId, today, readableId.generate_transaction_id]
      )

      // VERIFY: Transaction was created correctly
      expect(parseFloat(transaction.amount)).toBe(1000)
      expect(transaction.type).toBe('income')
      expect(transaction.payment_method_id).toBe(paymentMethodId)
      // Key assertion: payment_method_id is a UUID, not text
      expect(transaction.payment_method_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )

      // 4. Mark payment as paid
      await db.query(
        `UPDATE recurring_payments SET is_paid = true, paid_date = $1, transaction_id = $2 WHERE id = $3`,
        [today, transaction.id, payment.id]
      )

      // VERIFY: Payment is marked as paid
      const { rows: [updatedPayment] } = await db.query(
        'SELECT is_paid, transaction_id FROM recurring_payments WHERE id = $1',
        [payment.id]
      )
      expect(updatedPayment.is_paid).toBe(true)
      expect(updatedPayment.transaction_id).toBe(transaction.id)

      // VERIFY: Transaction appears when querying (simulates report)
      const { rows: reportTx } = await db.query(
        `SELECT t.id, t.amount, t.type, t.date, pm.name as payment_method_name
         FROM transactions t
         LEFT JOIN payment_methods pm ON pm.id = t.payment_method_id
         WHERE t.id = $1`,
        [transaction.id]
      )
      expect(reportTx.length).toBe(1)
      expect(reportTx[0].type).toBe('income')
      expect(reportTx[0].payment_method_name).toBeTruthy() // Has a resolved name

    } finally {
      // Cleanup test data
      await db.query(
        `DELETE FROM transactions WHERE description = 'Test Auto-Pay Income' AND user_id = $1`,
        [userId]
      )
      await db.query(
        `DELETE FROM recurring_payments WHERE recurring_transaction_id IN
         (SELECT id FROM recurring_transactions WHERE description = 'Test Auto-Pay Income' AND user_id = $1)`,
        [userId]
      )
      await db.query(
        `DELETE FROM recurring_transactions WHERE description = 'Test Auto-Pay Income' AND user_id = $1`,
        [userId]
      )
      await db.end()
    }
  })

  test('auto_pay=false: recurring payment due today should NOT create transaction', async () => {
    const db = await getDbClient()
    const userId = '00000000-0000-0000-0000-000000000001'
    const today = new Date().toISOString().split('T')[0]

    try {
      const { rows: [category] } = await db.query(
        "SELECT id FROM categories WHERE name = 'Salário' LIMIT 1"
      )

      // Create recurring transaction with auto_pay=FALSE
      const { rows: [recurring] } = await db.query(
        `INSERT INTO recurring_transactions (user_id, amount, type, category_id, description, payment_method, day_of_month, is_active, auto_pay)
         VALUES ($1, 2000, 'income', $2, 'Test No-Auto-Pay Income', 'PIX', $3, true, false)
         RETURNING id`,
        [userId, category.id, new Date().getDate()]
      )

      // Create recurring payment due today
      const { rows: [payment] } = await db.query(
        `INSERT INTO recurring_payments (recurring_transaction_id, user_id, due_date, is_paid)
         VALUES ($1, $2, $3, false)
         RETURNING id`,
        [recurring.id, userId, today]
      )

      // Simulate cron query — should NOT find this payment (auto_pay=false)
      const { rows: duePayments } = await db.query(
        `SELECT rp.id
         FROM recurring_payments rp
         JOIN recurring_transactions rt ON rt.id = rp.recurring_transaction_id
         WHERE rp.due_date = $1
           AND rp.is_paid = false
           AND rt.auto_pay = true
           AND rp.recurring_transaction_id = $2`,
        [today, recurring.id]
      )

      // VERIFY: No payments found for auto-processing
      expect(duePayments.length).toBe(0)

      // VERIFY: No transaction was created
      const { rows: transactions } = await db.query(
        `SELECT id FROM transactions
         WHERE user_id = $1 AND description = 'Test No-Auto-Pay Income'`,
        [userId]
      )
      expect(transactions.length).toBe(0)

      // VERIFY: Payment is still unpaid
      const { rows: [stillUnpaid] } = await db.query(
        'SELECT is_paid FROM recurring_payments WHERE id = $1',
        [payment.id]
      )
      expect(stillUnpaid.is_paid).toBe(false)

    } finally {
      await db.query(
        `DELETE FROM recurring_payments WHERE recurring_transaction_id IN
         (SELECT id FROM recurring_transactions WHERE description = 'Test No-Auto-Pay Income' AND user_id = $1)`,
        [userId]
      )
      await db.query(
        `DELETE FROM recurring_transactions WHERE description = 'Test No-Auto-Pay Income' AND user_id = $1`,
        [userId]
      )
      await db.end()
    }
  })

  test('payment_method text resolves to correct payment_method_id UUID', async () => {
    const db = await getDbClient()
    const userId = '00000000-0000-0000-0000-000000000001'

    try {
      // Test exact match
      const { rows: pixMatch } = await db.query(
        `SELECT id, name FROM payment_methods
         WHERE user_id = $1 AND LOWER(name) = LOWER('PIX')
         LIMIT 1`,
        [userId]
      )
      expect(pixMatch.length).toBe(1)
      expect(pixMatch[0].name).toBe('PIX')

      // Test case-insensitive match (ilike)
      const { rows: nubankMatch } = await db.query(
        `SELECT id, name FROM payment_methods
         WHERE user_id = $1 AND name ILIKE 'nubank'
         LIMIT 1`,
        [userId]
      )
      expect(nubankMatch.length).toBe(1)

      // Test fallback for non-existent payment method
      const { rows: noMatch } = await db.query(
        `SELECT id, name FROM payment_methods
         WHERE user_id = $1 AND name ILIKE 'nonexistent_method'
         LIMIT 1`,
        [userId]
      )
      expect(noMatch.length).toBe(0)

      // Fallback should return first payment method
      const { rows: [fallback] } = await db.query(
        `SELECT id, name FROM payment_methods
         WHERE user_id = $1
         ORDER BY created_at ASC
         LIMIT 1`,
        [userId]
      )
      expect(fallback).toBeTruthy()
      expect(fallback.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )

    } finally {
      await db.end()
    }
  })
})

// ============================================================================
// MIGRATION TEST: Enable auto_pay for existing records
// ============================================================================

test.describe('Migration: Enable auto_pay for existing', () => {

  test('migration should set auto_pay=true for all active recurring transactions', async () => {
    const db = await getDbClient()
    const userId = '00000000-0000-0000-0000-000000000001'

    try {
      // Create a test record with auto_pay=false (simulating pre-migration state)
      await db.query(
        `INSERT INTO recurring_transactions (user_id, amount, type, category_id, description, payment_method, day_of_month, is_active, auto_pay)
         VALUES ($1, 999, 'income', (SELECT id FROM categories WHERE name = 'Salário' LIMIT 1),
                 'Test Migration Record', 'PIX', 1, true, false)`,
        [userId]
      )

      // Verify it's false before migration
      const { rows: [before] } = await db.query(
        `SELECT auto_pay FROM recurring_transactions WHERE description = 'Test Migration Record' AND user_id = $1`,
        [userId]
      )
      expect(before.auto_pay).toBe(false)

      // Run the migration SQL
      await db.query('UPDATE recurring_transactions SET auto_pay = true WHERE is_active = true')

      // Verify it's true after migration
      const { rows: [after] } = await db.query(
        `SELECT auto_pay FROM recurring_transactions WHERE description = 'Test Migration Record' AND user_id = $1`,
        [userId]
      )
      expect(after.auto_pay).toBe(true)

    } finally {
      await db.query(
        `DELETE FROM recurring_transactions WHERE description = 'Test Migration Record' AND user_id = $1`,
        [userId]
      )
      await db.end()
    }
  })

  test('migration should NOT affect inactive recurring transactions', async () => {
    const db = await getDbClient()
    const userId = '00000000-0000-0000-0000-000000000001'

    try {
      // Reset all to false first for clean test
      await db.query('UPDATE recurring_transactions SET auto_pay = false WHERE user_id = $1', [userId])

      // Create inactive record
      await db.query(
        `INSERT INTO recurring_transactions (user_id, amount, type, category_id, description, payment_method, day_of_month, is_active, auto_pay)
         VALUES ($1, 888, 'income', (SELECT id FROM categories WHERE name = 'Salário' LIMIT 1),
                 'Test Inactive Record', 'PIX', 1, false, false)`,
        [userId]
      )

      // Run migration
      await db.query('UPDATE recurring_transactions SET auto_pay = true WHERE is_active = true')

      // Inactive should still be false
      const { rows: [inactive] } = await db.query(
        `SELECT auto_pay FROM recurring_transactions WHERE description = 'Test Inactive Record' AND user_id = $1`,
        [userId]
      )
      expect(inactive.auto_pay).toBe(false)

      // Active ones should be true
      const { rows: activeOnes } = await db.query(
        `SELECT auto_pay FROM recurring_transactions WHERE is_active = true AND user_id = $1`,
        [userId]
      )
      activeOnes.forEach(row => expect(row.auto_pay).toBe(true))

    } finally {
      await db.query(
        `DELETE FROM recurring_transactions WHERE description = 'Test Inactive Record' AND user_id = $1`,
        [userId]
      )
      // Restore auto_pay=true for existing records
      await db.query('UPDATE recurring_transactions SET auto_pay = true WHERE is_active = true')
      await db.end()
    }
  })
})
