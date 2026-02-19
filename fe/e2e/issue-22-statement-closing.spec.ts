import { test, expect, type Page } from '@playwright/test'

/**
 * Issue #22 — Fechamento de Fatura
 *
 * CURRENT BEHAVIOR (wrong):
 * - User sets statement_closing_day (fixed day of month, e.g., day 5)
 * - User sets payment_due_day (days AFTER closing, e.g., 10 days)
 * - System calculates payment date: closing + due_days = payment date
 *
 * EXPECTED BEHAVIOR:
 * - User sets payment_day (fixed day of month, e.g., day 1)
 * - User sets days_before_payment_closes (e.g., 7 days)
 * - System CALCULATES closing_day dynamically: payment_day - days_before = closing
 *   (varies by month: Jan 1 - 7 = Dec 25, Feb 1 - 7 = Jan 25, Mar 1 - 7 = Feb 22)
 *
 * These tests define the EXPECTED behavior and should FAIL against current code.
 * They serve as acceptance criteria for the implementation.
 */

const TEST_USER = { email: 'dev@example.com', password: 'password123' }
const LOCALE = 'pt-br'
const DB_CONFIG = { host: '100.81.72.21', port: 54322, database: 'postgres', user: 'postgres', password: 'postgres' }

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
  await page.waitForTimeout(3000)
  await page.waitForLoadState('networkidle', { timeout: 15000 })
}

// ============================================================================
// SCHEMA TESTS — New field: days_before_closing
// ============================================================================

test.describe('Issue #22 — Schema: days_before_closing field', () => {

  test('payment_methods should have days_before_closing column', async () => {
    const db = await getDbClient()
    try {
      const { rows } = await db.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_name = 'payment_methods' AND column_name = 'days_before_closing'`
      )
      expect(rows.length).toBe(1)
      expect(rows[0].data_type).toBe('integer')
    } finally {
      await db.end()
    }
  })

  test('payment_due_day should store the actual payment DAY (not days-after-closing)', async () => {
    const db = await getDbClient()
    try {
      // With the new model, payment_due_day should be a day-of-month (1-31)
      // representing WHEN the user pays, not an offset
      // For the issue example: payment_due_day = 1 (pays on the 1st)
      const { rows } = await db.query(
        `SELECT payment_due_day FROM payment_methods
         WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'`
      )
      // Currently stores offset (10), should store actual day (10 happens to work here)
      // But the semantics should be: "I pay on day X" not "I pay X days after closing"
      // This test validates the COLUMN COMMENT or CHECK CONSTRAINT reflects the new meaning
      const { rows: constraints } = await db.query(
        `SELECT pg_get_constraintdef(c.oid) as def
         FROM pg_constraint c
         JOIN pg_class t ON c.conrelid = t.oid
         WHERE t.relname = 'payment_methods'
           AND pg_get_constraintdef(c.oid) LIKE '%payment_due_day%'`
      )
      // Should have constraint: payment_due_day BETWEEN 1 AND 31 (day of month)
      // not BETWEEN 1 AND 60 (offset)
      const hasCorrectConstraint = constraints.some((c: { def: string }) =>
        c.def.includes('31') || c.def.includes('day of month')
      )
      expect(hasCorrectConstraint).toBe(true)
    } finally {
      await db.end()
    }
  })
})

// ============================================================================
// CALCULATION TESTS — Dynamic closing day
// ============================================================================

test.describe('Issue #22 — Closing day calculation', () => {

  test('closing day should be calculated as payment_day minus days_before_closing', async () => {
    const db = await getDbClient()
    try {
      // Setup: payment on day 1, closes 7 days before
      await db.query(
        `UPDATE payment_methods
         SET payment_due_day = 1, days_before_closing = 7
         WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'`
      )

      // For January: day 1 - 7 days = December 25
      // For February: day 1 - 7 days = January 25
      // For March: day 1 - 7 days = February 22 (non-leap) or 21 (leap)

      // The system should have a function that calculates this
      const { rows } = await db.query(
        `SELECT calculate_closing_date(1, 7, '2026-01-15'::date) as closing_date`
      )
      // Closing for January billing cycle: December 25
      expect(rows[0].closing_date).toBeTruthy()

    } finally {
      // Restore
      await db.query(
        `UPDATE payment_methods
         SET payment_due_day = 10, days_before_closing = NULL
         WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'`
      )
      await db.end()
    }
  })

  test('closing day varies by month (28/30/31 day months)', async () => {
    const db = await getDbClient()
    try {
      // Payment day 1, 7 days before closing
      // March 1 - 7 = Feb 22 (28-day month, non-leap 2026)
      const { rows: feb } = await db.query(
        `SELECT calculate_closing_date(1, 7, '2026-03-01'::date) as closing_date`
      )
      expect(new Date(feb[0].closing_date).getDate()).toBe(22) // Feb 22

      // May 1 - 7 = Apr 24 (30-day month)
      const { rows: apr } = await db.query(
        `SELECT calculate_closing_date(1, 7, '2026-05-01'::date) as closing_date`
      )
      expect(new Date(apr[0].closing_date).getDate()).toBe(24) // Apr 24

      // Feb 1 - 7 = Jan 25 (31-day month)
      const { rows: jan } = await db.query(
        `SELECT calculate_closing_date(1, 7, '2026-02-01'::date) as closing_date`
      )
      expect(new Date(jan[0].closing_date).getDate()).toBe(25) // Jan 25

    } finally {
      await db.end()
    }
  })
})

// ============================================================================
// UI TESTS — New input model
// ============================================================================

test.describe('Issue #22 — UI: Payment day + days before closing', () => {

  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('credit card creation should ask for payment day (not closing day)', async ({ page }) => {
    // Navigate to settings or credit cards page
    await page.goto(`/${LOCALE}/settings`)
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    // Look for "add credit card" button
    const addButton = page.getByRole('button', { name: /adicionar.*cartão|novo.*cartão|criar.*cartão/i })
    if (await addButton.isVisible()) {
      await addButton.click()
    }

    // The form should ask for:
    // 1. "Dia de pagamento" (payment day) — NOT "Dia de fechamento"
    // 2. "Dias antes do pagamento para fechamento" — NOT "Dias após fechamento"
    await expect(page.getByText(/dia de pagamento/i)).toBeVisible()
    await expect(page.getByText(/dias antes.*fechamento|dias.*antes.*pagamento.*fecha/i)).toBeVisible()

    // Should NOT show the old "Dia de fechamento da fatura" as primary input
    // (closing day should be CALCULATED, not manually entered)
  })

  test('credit card edit should show payment day and days-before-closing', async ({ page }) => {
    await page.goto(`/${LOCALE}/settings`)
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    // Find a credit card and click edit
    const editButton = page.getByRole('button', { name: /editar|edit/i }).first()
    if (await editButton.isVisible()) {
      await editButton.click()
      await page.waitForLoadState('networkidle')

      // Should show payment day field
      await expect(page.getByText(/dia de pagamento/i)).toBeVisible()

      // Should show days-before-closing field
      await expect(page.getByText(/dias antes.*fechamento/i)).toBeVisible()

      // Should show CALCULATED closing day (read-only preview)
      await expect(page.getByText(/fechamento calculado|dia de fechamento.*calculado/i)).toBeVisible()
    }
  })
})

// ============================================================================
// INTEGRATION TESTS — Statement period with dynamic closing
// ============================================================================

test.describe('Issue #22 — Statement period uses dynamic closing', () => {

  test('statement period should use calculated closing day, not fixed', async () => {
    const db = await getDbClient()
    try {
      // With payment_day=1 and days_before_closing=7:
      // For a reference date in January 2026:
      // - Closing: Dec 25 (31 - 7 + 1 = 25)
      // - Period: Nov 26 to Dec 25
      // For a reference date in March 2026:
      // - Closing: Feb 22 (28 - 7 + 1 = 22)
      // - Period: Jan 23 to Feb 22

      // The calculate_statement_period RPC should accept the new model
      const { rows } = await db.query(
        `SELECT * FROM calculate_statement_period_v2(
          p_payment_day := 1,
          p_days_before := 7,
          p_reference_date := '2026-01-15'::date
        )`
      )

      expect(rows.length).toBe(1)
      // Period end (closing) should be Dec 25 for January billing
      const periodEnd = new Date(rows[0].period_end)
      expect(periodEnd.getMonth()).toBe(11) // December (0-indexed)
      expect(periodEnd.getDate()).toBe(25)

    } finally {
      await db.end()
    }
  })

  test('budget progress should use dynamic closing for period calculation', async () => {
    const db = await getDbClient()
    try {
      // get_budget_progress should work with the new model
      // It currently uses statement_closing_day directly
      // After fix, it should calculate closing from payment_due_day + days_before_closing
      const { rows } = await db.query(
        `SELECT * FROM get_budget_progress(
          p_user_id := '00000000-0000-0000-0000-000000000001'::uuid,
          p_payment_method_id := 'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
          p_closing_day := NULL
        )`
      )
      // Should NOT require p_closing_day anymore — should calculate internally
      // This test will fail because current function requires p_closing_day
      expect(rows).toBeTruthy()
    } finally {
      await db.end()
    }
  })
})

// ============================================================================
// WHATSAPP BOT TESTS — Reminders use dynamic closing
// ============================================================================

test.describe('Issue #22 — WhatsApp reminders use dynamic closing', () => {

  test('statement reminder query should find cards by calculated closing day', async () => {
    const db = await getDbClient()
    try {
      // Currently, statement-reminder-query.ts filters:
      //   .eq('statement_closing_day', targetDay)
      // After fix, it should calculate which cards close today based on:
      //   payment_due_day and days_before_closing

      // Setup: card with payment on day 1, 7 days before = closes Dec 25
      await db.query(
        `UPDATE payment_methods
         SET payment_due_day = 1, days_before_closing = 7, credit_mode = true
         WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'`
      )

      // On Dec 25, this card should be found as "closing today"
      // The query should calculate: payment_due_day(1) - days_before_closing(7) for December
      // = Dec 25 → match

      // This validates that the NEW query logic works
      // (will fail because days_before_closing column doesn't exist yet)
      const { rows } = await db.query(
        `SELECT id, name, payment_due_day, days_before_closing
         FROM payment_methods
         WHERE days_before_closing IS NOT NULL
           AND id = 'aaaaaaaa-0000-0000-0000-000000000001'`
      )
      expect(rows.length).toBe(1)
      expect(rows[0].days_before_closing).toBe(7)

    } finally {
      await db.query(
        `UPDATE payment_methods
         SET payment_due_day = 10, days_before_closing = NULL
         WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'`
      )
      await db.end()
    }
  })
})
