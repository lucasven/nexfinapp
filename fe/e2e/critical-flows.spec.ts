import { test, expect, type Page } from '@playwright/test'

/**
 * Critical Flows E2E Tests
 *
 * These tests cover the most important user flows that must always work:
 * - Credit card creation and mode selection
 * - Installment creation (with existing and new credit cards)
 * - Transaction creation with various payment methods
 *
 * Test data uses the local Supabase seed:
 * - Email: dev@example.com / Password: password123
 * - Has Nubank (Credit Mode), Itaú (Simple Mode), Conta Corrente, PIX
 */

// Test configuration
const TEST_USER = {
  email: 'dev@example.com',
  password: 'password123',
}

const LOCALE = 'pt-br'

// Helper function to login
async function login(page: Page) {
  await page.goto(`/${LOCALE}/auth/login`)
  await page.getByRole('textbox', { name: 'E-mail' }).fill(TEST_USER.email)
  await page.getByRole('textbox', { name: 'Senha' }).fill(TEST_USER.password)
  await page.getByRole('button', { name: 'Entrar' }).click()

  // Wait for redirect to home
  await expect(page).toHaveURL(new RegExp(`/${LOCALE}/?$`), { timeout: 15000 })
}

// Helper to open transaction dialog
async function openTransactionDialog(page: Page) {
  await page.getByRole('button', { name: 'Adicionar Transação' }).click()
  await expect(page.getByRole('dialog', { name: 'Adicionar Transação' })).toBeVisible()
}

// Helper to close transaction dialog
async function closeTransactionDialog(page: Page) {
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog', { name: 'Adicionar Transação' })).not.toBeVisible()
}

test.describe('Authentication', () => {
  test('should login with valid credentials', async ({ page }) => {
    await login(page)
    // Verify we're on the home page with financial summary
    await expect(page.getByText('Resumo Financeiro')).toBeVisible()
  })

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto(`/${LOCALE}/auth/login`)
    await page.getByRole('textbox', { name: 'E-mail' }).fill('invalid@example.com')
    await page.getByRole('textbox', { name: 'Senha' }).fill('wrongpassword')
    await page.getByRole('button', { name: 'Entrar' }).click()

    // Wait for error message
    await expect(page.getByText(/Invalid|Inválido/i)).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Credit Card Selection', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should show existing credit cards in payment method dropdown', async ({ page }) => {
    await openTransactionDialog(page)

    // Open payment method dropdown
    await page.getByRole('combobox', { name: 'Método de Pagamento' }).click()

    // Verify existing payment methods are visible
    await expect(page.getByRole('option', { name: /Nubank.*Modo Crédito/i })).toBeVisible()
    await expect(page.getByRole('option', { name: /Itaú.*Modo Débito/i })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Conta Corrente' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'PIX' })).toBeVisible()

    await closeTransactionDialog(page)
  })

  test('should show suggestions for new payment methods', async ({ page }) => {
    await openTransactionDialog(page)

    // Open payment method dropdown
    await page.getByRole('combobox', { name: 'Método de Pagamento' }).click()

    // Verify suggestions section exists
    await expect(page.getByText('Sugeridos')).toBeVisible()

    // Verify suggestion options (these depend on what's already created)
    await expect(page.getByRole('option', { name: /Cartão de Crédito.*será criado/i })).toBeVisible()
    await expect(page.getByRole('option', { name: /Cartão de Débito.*será criado/i })).toBeVisible()
    await expect(page.getByRole('option', { name: /Dinheiro.*será criado/i })).toBeVisible()

    await closeTransactionDialog(page)
  })

  test('should show Credit Mode indicator for Nubank', async ({ page }) => {
    await openTransactionDialog(page)

    await page.getByRole('combobox', { name: 'Método de Pagamento' }).click()

    // Check Nubank shows Credit Mode
    const nubankOption = page.getByRole('option', { name: /Nubank.*Modo Crédito/i })
    await expect(nubankOption).toBeVisible()

    // Check Itaú shows Simple Mode (Débito)
    const itauOption = page.getByRole('option', { name: /Itaú.*Modo Débito/i })
    await expect(itauOption).toBeVisible()

    await closeTransactionDialog(page)
  })
})

test.describe('Installment Creation - Critical Bug Fix', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should show installment toggle for Credit Mode card (Nubank)', async ({ page }) => {
    await openTransactionDialog(page)

    // Select Nubank (Credit Mode)
    await page.getByRole('combobox', { name: 'Método de Pagamento' }).click()
    await page.getByRole('option', { name: /Nubank.*Modo Crédito/i }).click()

    // Verify installment toggle is visible
    await expect(page.getByRole('checkbox', { name: 'Parcelar esta compra?' })).toBeVisible()

    await closeTransactionDialog(page)
  })

  test('should NOT show installment toggle for Simple Mode card (Itaú)', async ({ page }) => {
    await openTransactionDialog(page)

    // Select Itaú (Simple Mode)
    await page.getByRole('combobox', { name: 'Método de Pagamento' }).click()
    await page.getByRole('option', { name: /Itaú.*Modo Débito/i }).click()

    // Verify installment toggle is NOT visible
    await expect(page.getByRole('checkbox', { name: 'Parcelar esta compra?' })).not.toBeVisible()

    await closeTransactionDialog(page)
  })

  test('should NOT show installment toggle for non-credit payment methods', async ({ page }) => {
    await openTransactionDialog(page)

    // Select PIX
    await page.getByRole('combobox', { name: 'Método de Pagamento' }).click()
    await page.getByRole('option', { name: 'PIX' }).click()

    // Verify installment toggle is NOT visible
    await expect(page.getByRole('checkbox', { name: 'Parcelar esta compra?' })).not.toBeVisible()

    await closeTransactionDialog(page)
  })

  test('[REGRESSION] should show installment toggle when selecting NEW credit card', async ({ page }) => {
    /**
     * This is the critical bug that was fixed!
     * Previously, selecting "Cartão de Crédito (será criado)" would hide the installment toggle
     * because the system couldn't determine if the new card would have Credit Mode.
     *
     * The fix assumes new credit cards created during installment flow will use Credit Mode.
     */
    await openTransactionDialog(page)

    // Select "Create new credit card" suggestion
    await page.getByRole('combobox', { name: 'Método de Pagamento' }).click()
    await page.getByRole('option', { name: /Cartão de Crédito.*será criado/i }).click()

    // Verify installment toggle IS VISIBLE (this is the regression test)
    await expect(page.getByRole('checkbox', { name: 'Parcelar esta compra?' })).toBeVisible()

    await closeTransactionDialog(page)
  })

  test('should show installment form when toggle is checked', async ({ page }) => {
    await openTransactionDialog(page)

    // Select Nubank
    await page.getByRole('combobox', { name: 'Método de Pagamento' }).click()
    await page.getByRole('option', { name: /Nubank.*Modo Crédito/i }).click()

    // Check installment toggle
    await page.getByRole('checkbox', { name: 'Parcelar esta compra?' }).check()

    // Verify installment form fields appear
    await expect(page.getByLabel('Valor Total')).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Número de Parcelas' })).toBeVisible()
    await expect(page.getByLabel('Data da Primeira Parcela')).toBeVisible()
    await expect(page.getByLabel(/Loja.*Opcional/i)).toBeVisible()

    await closeTransactionDialog(page)
  })

  test('should show installment form when selecting NEW credit card and checking toggle', async ({ page }) => {
    /**
     * Full flow test for the critical bug fix:
     * 1. Select "Create new credit card"
     * 2. Check installment toggle
     * 3. Verify installment form appears
     */
    await openTransactionDialog(page)

    // Select new credit card suggestion
    await page.getByRole('combobox', { name: 'Método de Pagamento' }).click()
    await page.getByRole('option', { name: /Cartão de Crédito.*será criado/i }).click()

    // Check installment toggle
    await page.getByRole('checkbox', { name: 'Parcelar esta compra?' }).check()

    // Verify installment form fields appear
    await expect(page.getByLabel('Valor Total')).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Número de Parcelas' })).toBeVisible()
    await expect(page.getByLabel('Data da Primeira Parcela')).toBeVisible()
    await expect(page.getByLabel(/Loja.*Opcional/i)).toBeVisible()

    await closeTransactionDialog(page)
  })

  test('should calculate monthly payment correctly', async ({ page }) => {
    await openTransactionDialog(page)

    // Select Nubank
    await page.getByRole('combobox', { name: 'Método de Pagamento' }).click()
    await page.getByRole('option', { name: /Nubank.*Modo Crédito/i }).click()

    // Check installment toggle
    await page.getByRole('checkbox', { name: 'Parcelar esta compra?' }).check()

    // Fill total amount
    await page.getByLabel('Valor Total').fill('1200')

    // Select 12 installments
    await page.getByRole('combobox', { name: 'Número de Parcelas' }).click()
    await page.getByRole('option', { name: '12x' }).click()

    // Verify monthly payment calculation (1200 / 12 = 100)
    await expect(page.getByText(/R\$\s*100[,.]00.*mês/i)).toBeVisible()

    await closeTransactionDialog(page)
  })
})

test.describe('Transaction Creation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should create expense transaction with existing payment method', async ({ page }) => {
    await openTransactionDialog(page)

    // Fill transaction form
    await page.getByLabel('Valor').fill('50.00')
    await page.getByRole('combobox', { name: 'Categoria' }).click()
    // Select first available category
    await page.getByRole('option').first().click()

    await page.getByRole('combobox', { name: 'Método de Pagamento' }).click()
    await page.getByRole('option', { name: 'PIX' }).click()

    await page.getByLabel('Descrição').fill('E2E Test Transaction')

    // Submit
    await page.getByRole('button', { name: 'Adicionar' }).click()

    // Wait for dialog to close (indicates success)
    await expect(page.getByRole('dialog', { name: 'Adicionar Transação' })).not.toBeVisible({ timeout: 10000 })

    // Verify transaction appears in the list
    await expect(page.getByText('E2E Test Transaction')).toBeVisible({ timeout: 5000 })
  })

  test('should show type selector with income and expense options', async ({ page }) => {
    await openTransactionDialog(page)

    // Check type dropdown
    await page.getByRole('combobox', { name: 'Tipo' }).click()
    await expect(page.getByRole('option', { name: 'Receita' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Despesa' })).toBeVisible()

    await closeTransactionDialog(page)
  })
})

test.describe('Budget Widget', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should display budget widget for Credit Mode card', async ({ page }) => {
    // Nubank has Credit Mode and budget set in seed data
    await expect(page.getByText('Nubank')).toBeVisible()
    await expect(page.getByText(/R\$.*\/.*R\$\s*3[.,]000/)).toBeVisible() // Budget R$ 3,000
  })

  test('should show budget progress percentage', async ({ page }) => {
    // Look for percentage text
    await expect(page.getByText(/\d+[.,]?\d*%.*orçamento/i)).toBeVisible()
  })
})

test.describe('Payment Method Creation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should show payment method will be created indicator', async ({ page }) => {
    await openTransactionDialog(page)

    await page.getByRole('combobox', { name: 'Método de Pagamento' }).click()

    // Check that suggestions show "(será criado)"
    const creditCardSuggestion = page.getByRole('option', { name: /Cartão de Crédito.*será criado/i })
    await expect(creditCardSuggestion).toBeVisible()
    await expect(creditCardSuggestion).toContainText('será criado')

    await closeTransactionDialog(page)
  })
})

test.describe('Localization', () => {
  test('should display in Portuguese (pt-BR)', async ({ page }) => {
    await login(page)

    // Verify Portuguese UI elements
    await expect(page.getByText('Resumo Financeiro')).toBeVisible()
    await expect(page.getByText('Receitas')).toBeVisible()
    await expect(page.getByText('Despesas')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Adicionar Transação' })).toBeVisible()
  })

  test('should display in English when using en locale', async ({ page }) => {
    await page.goto('/en/auth/login')
    await page.getByRole('textbox', { name: 'Email' }).fill(TEST_USER.email)
    await page.getByRole('textbox', { name: 'Password' }).fill(TEST_USER.password)
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page).toHaveURL(/\/en\/?$/, { timeout: 15000 })

    // Verify English UI elements
    await expect(page.getByText('Financial Summary')).toBeVisible()
    await expect(page.getByText('Income')).toBeVisible()
    await expect(page.getByText('Expenses')).toBeVisible()
  })
})
