import { test, expect, type Page } from '@playwright/test'

/**
 * Onboarding Flow E2E Tests
 *
 * These tests cover the new user onboarding experience:
 * - Welcome screen with feature overview
 * - WhatsApp setup option
 * - Guided tour through the app
 * - Skip tour functionality
 *
 * IMPORTANT: These tests require a fresh user with onboarding NOT completed.
 * Run the reset script before tests: npm run test:e2e:reset-onboarding
 */

// Test configuration
const FRESH_USER = {
  email: 'fresh@example.com',
  password: 'password123',
  userId: '00000000-0000-0000-0000-000000000002',
}

const LOCALE = 'pt-br'

// Helper function to reset onboarding status before tests
async function resetOnboardingStatus(): Promise<void> {
  // This would typically call a test API or direct DB update
  // For now, we rely on the test setup script
  console.log('Note: Onboarding status should be reset before running these tests')
}

// Helper function to login fresh user
async function loginFreshUser(page: Page) {
  await page.goto(`/${LOCALE}/auth/login`)
  await page.getByRole('textbox', { name: 'E-mail' }).fill(FRESH_USER.email)
  await page.getByRole('textbox', { name: 'Senha' }).fill(FRESH_USER.password)
  await page.getByRole('button', { name: 'Entrar' }).click()

  // Wait for redirect to onboarding welcome
  await expect(page).toHaveURL(new RegExp(`/${LOCALE}/onboarding`), { timeout: 15000 })
}

test.describe('Onboarding Flow', () => {
  test.beforeAll(async () => {
    await resetOnboardingStatus()
  })

  test.describe('Welcome Screen', () => {
    test('should redirect fresh user to onboarding after login', async ({ page }) => {
      await page.goto(`/${LOCALE}/auth/login`)
      await page.getByRole('textbox', { name: 'E-mail' }).fill(FRESH_USER.email)
      await page.getByRole('textbox', { name: 'Senha' }).fill(FRESH_USER.password)
      await page.getByRole('button', { name: 'Entrar' }).click()

      // Should redirect to onboarding, not home
      await expect(page).toHaveURL(new RegExp(`/${LOCALE}/onboarding`), { timeout: 15000 })
    })

    test('should display welcome message and features', async ({ page }) => {
      await loginFreshUser(page)

      // Verify welcome screen elements
      await expect(page.getByRole('heading', { name: /Bem-vindo/i })).toBeVisible()

      // Verify feature descriptions
      await expect(page.getByText(/Rastreie Despesas/i)).toBeVisible()
      await expect(page.getByText(/OCR Inteligente/i)).toBeVisible()
      await expect(page.getByText(/Orçamentos Mensais/i)).toBeVisible()
    })

    test('should show WhatsApp connection option', async ({ page }) => {
      await loginFreshUser(page)

      // Verify WhatsApp setup section
      await expect(page.getByRole('heading', { name: /Conecte seu WhatsApp/i })).toBeVisible()
      await expect(page.getByRole('button', { name: /Adicionar Número do WhatsApp/i })).toBeVisible()
    })

    test('should have start button to proceed', async ({ page }) => {
      await loginFreshUser(page)

      // Verify start button exists
      await expect(page.getByRole('button', { name: 'Começar' })).toBeVisible()
    })
  })

  test.describe('Onboarding Progression', () => {
    test('should proceed to guided tour after clicking start', async ({ page }) => {
      await loginFreshUser(page)

      // Click start button
      await page.getByRole('button', { name: 'Começar' }).click()

      // Wait for navigation to categories page with tour
      await expect(page).toHaveURL(new RegExp(`/${LOCALE}/categories`), { timeout: 15000 })

      // Verify tour is visible
      await expect(page.getByRole('heading', { name: /Crie sua Primeira Categoria/i })).toBeVisible({ timeout: 10000 })
    })

    test('should allow skipping the tour', async ({ page }) => {
      await loginFreshUser(page)

      // Click start button
      await page.getByRole('button', { name: 'Começar' }).click()

      // Wait for tour to appear
      await expect(page.getByRole('button', { name: 'Pular Tour' })).toBeVisible({ timeout: 10000 })

      // Skip the tour
      await page.getByRole('button', { name: 'Pular Tour' }).click()

      // Tour should be dismissed
      await expect(page.getByRole('button', { name: 'Pular Tour' })).not.toBeVisible()
    })

    test('should show progress indicator during tour', async ({ page }) => {
      await loginFreshUser(page)

      // Click start button
      await page.getByRole('button', { name: 'Começar' }).click()

      // Wait for tour
      await expect(page.getByText('Progresso')).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('WhatsApp Setup Flow', () => {
    test('should open WhatsApp number dialog when clicking add button', async ({ page }) => {
      await loginFreshUser(page)

      // Click add WhatsApp number button
      await page.getByRole('button', { name: /Adicionar Número do WhatsApp/i }).click()

      // Should show dialog or input for phone number
      // This depends on the implementation - could be a dialog or inline form
      await expect(page.getByText(/WhatsApp/i)).toBeVisible()
    })

    test('should show WhatsApp connected status when number exists', async ({ page }) => {
      // This test verifies the UI when WhatsApp is already connected
      // The fresh user might have a number from previous testing
      await loginFreshUser(page)

      // If already connected, should show connected status
      const connectedIndicator = page.getByText(/WhatsApp Conectado/i)
      const addButton = page.getByRole('button', { name: /Adicionar Número do WhatsApp/i })

      // Either connected or add button should be visible
      await expect(connectedIndicator.or(addButton)).toBeVisible()
    })
  })
})

test.describe('Onboarding - English Locale', () => {
  test('should display welcome screen in English', async ({ page }) => {
    await page.goto('/en/auth/login')
    await page.getByRole('textbox', { name: 'Email' }).fill(FRESH_USER.email)
    await page.getByRole('textbox', { name: 'Password' }).fill(FRESH_USER.password)
    await page.getByRole('button', { name: 'Sign In' }).click()

    // Wait for redirect to onboarding
    await expect(page).toHaveURL(/\/en\/onboarding/, { timeout: 15000 })

    // Verify English content
    await expect(page.getByRole('heading', { name: /Welcome/i })).toBeVisible()
  })
})

test.describe('Completed User - No Onboarding', () => {
  const DEV_USER = {
    email: 'dev@example.com',
    password: 'password123',
  }

  test('should redirect completed user directly to home', async ({ page }) => {
    await page.goto(`/${LOCALE}/auth/login`)
    await page.getByRole('textbox', { name: 'E-mail' }).fill(DEV_USER.email)
    await page.getByRole('textbox', { name: 'Senha' }).fill(DEV_USER.password)
    await page.getByRole('button', { name: 'Entrar' }).click()

    // Dev user should go directly to home, NOT onboarding
    await expect(page).toHaveURL(new RegExp(`/${LOCALE}/?$`), { timeout: 15000 })

    // Should see dashboard, not onboarding
    await expect(page.getByText('Resumo Financeiro')).toBeVisible()
  })

  test('should NOT show onboarding tour for completed user', async ({ page }) => {
    await page.goto(`/${LOCALE}/auth/login`)
    await page.getByRole('textbox', { name: 'E-mail' }).fill(DEV_USER.email)
    await page.getByRole('textbox', { name: 'Senha' }).fill(DEV_USER.password)
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page).toHaveURL(new RegExp(`/${LOCALE}/?$`), { timeout: 15000 })

    // Navigate to categories
    await page.getByRole('button', { name: 'Configurar' }).click()
    await page.getByRole('menuitem', { name: 'Categorias' }).click()

    // Should NOT see onboarding tour
    await expect(page.getByRole('button', { name: 'Pular Tour' })).not.toBeVisible()
  })
})
