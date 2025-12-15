/**
 * Tests for Future Commitments Month List Component
 * Epic 2 Story 2.3: Future Commitments Dashboard
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FutureCommitmentsMonthList } from '@/components/dashboard/future-commitments-month-list'
import type { FutureCommitment } from '@/lib/types'

// Mock next-intl
jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: any) => {
    const translations: Record<string, string> = {
      'futureCommitments.paymentCount_one': `${params?.count} parcela`,
      'futureCommitments.paymentCount': `${params?.count} parcelas`,
      'futureCommitments.loading': 'Carregando...',
    }
    return translations[key] || key
  },
  useLocale: () => 'pt-br',
}))

// Mock date-fns locale
jest.mock('date-fns/locale', () => ({
  ptBR: {},
  enUS: {},
}))

// Mock server actions
jest.mock('@/lib/actions/installments', () => ({
  getFutureCommitmentsByMonth: jest.fn(),
}))

// Mock formatCurrency
jest.mock('@/lib/localization/format', () => ({
  formatCurrency: (amount: number, locale: string) => {
    if (locale === 'pt-br') {
      return `R$ ${amount.toFixed(2).replace('.', ',')}`
    }
    return `R$ ${amount.toFixed(2)}`
  },
}))

import { getFutureCommitmentsByMonth } from '@/lib/actions/installments'

const mockGetFutureCommitmentsByMonth = getFutureCommitmentsByMonth as jest.MockedFunction<typeof getFutureCommitmentsByMonth>

describe('FutureCommitmentsMonthList', () => {
  const mockCommitments: FutureCommitment[] = [
    {
      month: '2025-01',
      total_due: 450,
      payment_count: 3,
    },
    {
      month: '2025-02',
      total_due: 450,
      payment_count: 3,
    },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('AC3.1: Monthly Breakdown Display', () => {
    it('should render monthly breakdown correctly', () => {
      render(<FutureCommitmentsMonthList commitments={mockCommitments} />)

      // Should show both months
      expect(screen.getByText(/Janeiro 2025/i)).toBeInTheDocument()
      expect(screen.getByText(/Fevereiro 2025/i)).toBeInTheDocument()

      // Should show payment counts
      expect(screen.getAllByText('3 parcelas')).toHaveLength(2)

      // Should show amounts
      expect(screen.getAllByText('R$ 450,00')).toHaveLength(2)
    })

    it('should format currency correctly for pt-BR', () => {
      render(<FutureCommitmentsMonthList commitments={mockCommitments} />)

      // Currency should use comma for decimals
      expect(screen.getAllByText(/R\$ 450,00/)).toHaveLength(2)
    })

    it('should show singular payment count for single payment', () => {
      const singleCommitment: FutureCommitment[] = [
        {
          month: '2025-01',
          total_due: 100,
          payment_count: 1,
        },
      ]

      render(<FutureCommitmentsMonthList commitments={singleCommitment} />)

      expect(screen.getByText('1 parcela')).toBeInTheDocument()
    })
  })

  describe('AC3.2: Expandable Details', () => {
    it('should expand month details on click', async () => {
      mockGetFutureCommitmentsByMonth.mockResolvedValue({
        success: true,
        data: [
          {
            plan_id: 'plan-1',
            description: 'Celular',
            installment_number: 3,
            total_installments: 12,
            amount: 200,
            category_id: null,
          },
          {
            plan_id: 'plan-2',
            description: 'Notebook',
            installment_number: 5,
            total_installments: 8,
            amount: 150,
            category_id: null,
          },
        ],
      })

      render(<FutureCommitmentsMonthList commitments={mockCommitments} />)

      // Click on first month to expand
      const firstMonthButton = screen.getAllByRole('button')[0]
      fireEvent.click(firstMonthButton)

      // Should fetch month details
      await waitFor(() => {
        expect(mockGetFutureCommitmentsByMonth).toHaveBeenCalledWith('2025-01')
      })

      // Should show individual installments
      await waitFor(() => {
        expect(screen.getByText('Celular')).toBeInTheDocument()
        expect(screen.getByText('Notebook')).toBeInTheDocument()
        expect(screen.getByText('3/12')).toBeInTheDocument()
        expect(screen.getByText('5/8')).toBeInTheDocument()
      })
    })

    it('should collapse month details on second click', async () => {
      mockGetFutureCommitmentsByMonth.mockResolvedValue({
        success: true,
        data: [
          {
            plan_id: 'plan-1',
            description: 'Celular',
            installment_number: 3,
            total_installments: 12,
            amount: 200,
            category_id: null,
          },
        ],
      })

      render(<FutureCommitmentsMonthList commitments={mockCommitments} />)

      const firstMonthButton = screen.getAllByRole('button')[0]

      // Expand
      fireEvent.click(firstMonthButton)
      await waitFor(() => {
        expect(screen.getByText('Celular')).toBeInTheDocument()
      })

      // Collapse
      fireEvent.click(firstMonthButton)
      await waitFor(() => {
        expect(screen.queryByText('Celular')).not.toBeInTheDocument()
      })
    })

    it('should show loading state while fetching details', async () => {
      // Mock delayed response
      mockGetFutureCommitmentsByMonth.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true, data: [] }), 100))
      )

      render(<FutureCommitmentsMonthList commitments={mockCommitments} />)

      const firstMonthButton = screen.getAllByRole('button')[0]
      fireEvent.click(firstMonthButton)

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByText('Carregando...')).toBeInTheDocument()
      })
    })

    it('should allow multiple months to be expanded simultaneously', async () => {
      mockGetFutureCommitmentsByMonth
        .mockResolvedValueOnce({
          success: true,
          data: [
            {
              plan_id: 'plan-1',
              description: 'January Item',
              installment_number: 1,
              total_installments: 3,
              amount: 200,
              category_id: null,
            },
          ],
        })
        .mockResolvedValueOnce({
          success: true,
          data: [
            {
              plan_id: 'plan-2',
              description: 'February Item',
              installment_number: 1,
              total_installments: 3,
              amount: 200,
              category_id: null,
            },
          ],
        })

      render(<FutureCommitmentsMonthList commitments={mockCommitments} />)

      // Expand first month
      const firstMonthButton = screen.getAllByRole('button')[0]
      fireEvent.click(firstMonthButton)
      await waitFor(() => {
        expect(screen.getByText('January Item')).toBeInTheDocument()
      })

      // Expand second month (first should still be expanded)
      const secondMonthButton = screen.getAllByRole('button')[1]
      fireEvent.click(secondMonthButton)
      await waitFor(() => {
        expect(screen.getByText('February Item')).toBeInTheDocument()
      })

      // Both should be visible
      expect(screen.getByText('January Item')).toBeInTheDocument()
      expect(screen.getByText('February Item')).toBeInTheDocument()
    })

    it('should cache month details and not refetch on second expand', async () => {
      mockGetFutureCommitmentsByMonth.mockResolvedValue({
        success: true,
        data: [
          {
            plan_id: 'plan-1',
            description: 'Cached Item',
            installment_number: 1,
            total_installments: 3,
            amount: 200,
            category_id: null,
          },
        ],
      })

      render(<FutureCommitmentsMonthList commitments={mockCommitments} />)

      const firstMonthButton = screen.getAllByRole('button')[0]

      // Expand first time
      fireEvent.click(firstMonthButton)
      await waitFor(() => {
        expect(screen.getByText('Cached Item')).toBeInTheDocument()
      })

      // Collapse
      fireEvent.click(firstMonthButton)

      // Expand again
      fireEvent.click(firstMonthButton)

      // Should only have been called once (data is cached)
      expect(mockGetFutureCommitmentsByMonth).toHaveBeenCalledTimes(1)

      // Should still show the cached data
      expect(screen.getByText('Cached Item')).toBeInTheDocument()
    })
  })
})
