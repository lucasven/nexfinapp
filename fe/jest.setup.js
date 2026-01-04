/* eslint-env node, jest */
// Jest setup file for React Testing Library
require('@testing-library/jest-dom')

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      pathname: '/',
      query: {},
      asPath: '/',
    }
  },
  useSearchParams() {
    return new URLSearchParams()
  },
  usePathname() {
    return '/'
  },
}))

// Mock next-intl
// Note: useLocale returns routing locale ('pt-br'), not Intl locale ('pt-BR')
jest.mock('next-intl', () => ({
  useTranslations: () => (key) => key,
  useLocale: () => 'pt-br',
}))

// Mock PostHog
jest.mock('posthog-js', () => ({
  init: jest.fn(),
  capture: jest.fn(),
}))

// Suppress console errors in tests (optional)
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
}
