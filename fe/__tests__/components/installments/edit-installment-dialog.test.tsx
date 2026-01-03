/**
 * Tests for Edit Installment Dialog Component
 * Epic 2 Story 2.6: Edit Installment Plan
 *
 * Tests component rendering, form validation, real-time calculation,
 * impact preview, and user interactions
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EditInstallmentDialog } from '@/components/installments/edit-installment-dialog'
import { getInstallmentDetails, updateInstallment } from '@/lib/actions/installments'
import type { InstallmentPlanDetails, Category } from '@/lib/types'

// Mock dependencies
jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: any) => {
    const translations: Record<string, string> = {
      'dialogTitle': 'Editar Parcelamento',
      'description': 'Descrição',
      'descriptionPlaceholder': 'Ex: Celular Samsung',
      'category': 'Categoria',
      'categoryPlaceholder': 'Selecione uma categoria',
      'merchant': 'Loja/Comerciante',
      'merchantPlaceholder': 'Ex: Magazine Luiza',
      'totalAmount': 'Valor Total',
      'totalInstallments': 'Número de Parcelas',
      'monthlyPayment': 'Valor Mensal (recalculado)',
      'minInstallments': `Mínimo: ${params?.count || 0} (já pagas) • Máximo: 60`,
      'whatHappens': 'O que vai acontecer:',
      'paidUnchanged': `${params?.count || 0} parcelas pagas permanecem inalteradas`,
      'paidUnchanged_one': `${params?.count || 0} parcela paga permanece inalterada`,
      'pendingRecalculated': `${params?.count || 0} parcelas pendentes serão recalculadas`,
      'pendingRecalculated_one': `${params?.count || 0} parcela pendente será recalculada`,
      'paymentsAdded': `${params?.count || 0} parcelas adicionadas`,
      'paymentsAdded_one': `${params?.count || 0} parcela adicionada`,
      'paymentsRemoved': `${params?.count || 0} parcelas removidas`,
      'paymentsRemoved_one': `${params?.count || 0} parcela removida`,
      'monthlyChange': `Valor mensal: ${params?.oldAmount} → ${params?.newAmount}`,
      'commitmentsUpdated': 'Compromissos futuros atualizados',
      'buttonCancel': 'Cancelar',
      'buttonSave': 'Salvar Alterações',
      'saving': 'Salvando...',
      'loading': 'Carregando...',
      'successTitle': 'Parcelamento atualizado!',
      'successFields': `Campos atualizados: ${params?.fields}`,
      'errorDescriptionRequired': 'Descrição é obrigatória',
      'errorAmountInvalid': 'Valor deve ser maior que zero',
      'errorInstallmentsTooLow': `Número de parcelas não pode ser menor que ${params?.count} (já pagas)`,
      'errorInstallmentsTooHigh': 'Máximo de 60 parcelas permitido',
      'errorGeneric': 'Erro ao editar parcelamento. Tente novamente.',
      'warningUnsavedChanges': 'Você tem alterações não salvas. Descartar?',
    }
    return translations[key] || key
  },
  useLocale: () => 'pt-br',
}))

jest.mock('posthog-js/react', () => ({
  usePostHog: () => ({
    capture: jest.fn(),
  }),
}))

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/lib/actions/installments', () => ({
  getInstallmentDetails: jest.fn(),
  updateInstallment: jest.fn(),
}))

const mockGetInstallmentDetails = getInstallmentDetails as jest.MockedFunction<typeof getInstallmentDetails>
const mockUpdateInstallment = updateInstallment as jest.MockedFunction<typeof updateInstallment>

describe('EditInstallmentDialog', () => {
  const mockCategories: Category[] = [
    { id: 'cat-1', name: 'Eletrônicos', icon: '📱', user_id: 'user-1', type: 'expense', color: '#FF0000', is_custom: true, is_system: false, created_at: '2024-01-01T00:00:00Z' },
    { id: 'cat-2', name: 'Casa', icon: '🏠', user_id: 'user-1', type: 'expense', color: '#00FF00', is_custom: true, is_system: false, created_at: '2024-01-01T00:00:00Z' },
  ]

  const mockPlanDetails: InstallmentPlanDetails = {
    plan: {
      id: 'plan-123',
      user_id: 'user-1',
      payment_method_id: 'pm-1',
      description: 'Celular Samsung',
      total_amount: 1200,
      total_installments: 12,
      merchant: 'Magazine Luiza',
      category_id: 'cat-1',
      next_payment_date: '2025-01-01',
      status: 'active',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      payment_method_name: 'Nubank',
      payment_method_type: 'credit',
      category_name: 'Eletrônicos',
      category_emoji: '📱',
      payments_paid: 3,
      remaining_amount: 900,
    },
    payments: [],
    payments_paid_count: 3,
    payments_pending_count: 9,
    total_paid: 300,
    total_remaining: 900,
  }

  const defaultProps = {
    open: true,
    onOpenChange: jest.fn(),
    planId: 'plan-123',
    onSuccess: jest.fn(),
    categories: mockCategories,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetInstallmentDetails.mockResolvedValue({
      success: true,
      data: mockPlanDetails,
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  /**
   * Rendering Tests
   */
  describe('Dialog Rendering', () => {
    it('should render dialog with title when open', async () => {
      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Editar Parcelamento')).toBeInTheDocument()
      })
    })

    it('should fetch and pre-fill plan details on open', async () => {
      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        expect(mockGetInstallmentDetails).toHaveBeenCalledWith('plan-123')
      })

      // Check pre-filled values
      await waitFor(() => {
        const descriptionInput = screen.getByLabelText(/Descrição/i) as HTMLInputElement
        expect(descriptionInput.value).toBe('Celular Samsung')
      })
    })

    it('should show loading state while fetching details', () => {
      render(<EditInstallmentDialog {...defaultProps} />)

      expect(screen.getByText('Carregando...')).toBeInTheDocument()
    })

    it('should show error state if fetch fails', async () => {
      mockGetInstallmentDetails.mockResolvedValue({
        success: false,
        error: 'Failed to load',
      })

      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Failed to load')).toBeInTheDocument()
      })
    })

    it('should render all editable fields', async () => {
      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByLabelText(/Descrição/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/Categoria/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/Loja\/Comerciante/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/Valor Total/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/Número de Parcelas/i)).toBeInTheDocument()
        expect(screen.getByText(/Valor Mensal \(recalculado\)/i)).toBeInTheDocument()
      })
    })

    it('should render category dropdown with user categories', async () => {
      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        const categorySelect = screen.getByLabelText(/Categoria/i)
        fireEvent.click(categorySelect)
      })

      await waitFor(() => {
        expect(screen.getByText('📱 Eletrônicos')).toBeInTheDocument()
        expect(screen.getByText('🏠 Casa')).toBeInTheDocument()
      })
    })
  })

  /**
   * Form Validation Tests
   */
  describe('Form Validation', () => {
    it('should show validation error for empty description', async () => {
      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        const descriptionInput = screen.getByLabelText(/Descrição/i)
        fireEvent.change(descriptionInput, { target: { value: '' } })
        fireEvent.blur(descriptionInput)
      })

      await waitFor(() => {
        expect(screen.getByText('Descrição é obrigatória')).toBeInTheDocument()
      })
    })

    it('should show validation error for invalid amount', async () => {
      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        const amountInput = screen.getByLabelText(/Valor Total/i)
        fireEvent.change(amountInput, { target: { value: '0' } })
        fireEvent.blur(amountInput)
      })

      await waitFor(() => {
        expect(screen.getByText('Valor deve ser maior que zero')).toBeInTheDocument()
      })
    })

    it('should show validation error for installments below paid count', async () => {
      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        const installmentsInput = screen.getByLabelText(/Número de Parcelas/i)
        fireEvent.change(installmentsInput, { target: { value: '2' } }) // Less than 3 paid
        fireEvent.blur(installmentsInput)
      })

      await waitFor(() => {
        expect(screen.getByText(/não pode ser menor que 3/i)).toBeInTheDocument()
      })
    })

    it('should show validation error for installments above 60', async () => {
      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        const installmentsInput = screen.getByLabelText(/Número de Parcelas/i)
        fireEvent.change(installmentsInput, { target: { value: '61' } })
        fireEvent.blur(installmentsInput)
      })

      await waitFor(() => {
        expect(screen.getByText('Máximo de 60 parcelas permitido')).toBeInTheDocument()
      })
    })

    it('should disable save button when form is invalid', async () => {
      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        const descriptionInput = screen.getByLabelText(/Descrição/i)
        fireEvent.change(descriptionInput, { target: { value: '' } })
      })

      await waitFor(() => {
        const saveButton = screen.getByText('Salvar Alterações')
        expect(saveButton).toBeDisabled()
      })
    })
  })

  /**
   * Real-Time Calculation Tests
   */
  describe('Real-Time Monthly Payment Calculation', () => {
    it('should update monthly payment when amount changes', async () => {
      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        const amountInput = screen.getByLabelText(/Valor Total/i)
        fireEvent.change(amountInput, { target: { value: '1500' } })
      })

      // New calculation: (1500 - 300 paid) / 9 pending = R$ 133.33
      await waitFor(() => {
        expect(screen.getByText(/R\$ 133[,.]33/)).toBeInTheDocument()
      })
    })

    it('should update monthly payment when installments change', async () => {
      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        const installmentsInput = screen.getByLabelText(/Número de Parcelas/i)
        fireEvent.change(installmentsInput, { target: { value: '15' } })
      })

      // New calculation: (1200 - 300 paid) / 12 pending = R$ 75.00
      await waitFor(() => {
        expect(screen.getByText(/R\$ 75[,.]00/)).toBeInTheDocument()
      })
    })

    it('should recalculate when both amount and installments change', async () => {
      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        const amountInput = screen.getByLabelText(/Valor Total/i)
        const installmentsInput = screen.getByLabelText(/Número de Parcelas/i)

        fireEvent.change(amountInput, { target: { value: '1800' } })
        fireEvent.change(installmentsInput, { target: { value: '18' } })
      })

      // New calculation: (1800 - 300 paid) / 15 pending = R$ 100.00
      await waitFor(() => {
        expect(screen.getByText(/R\$ 100[,.]00/)).toBeInTheDocument()
      })
    })
  })

  /**
   * Impact Preview Tests
   */
  describe('Impact Preview', () => {
    it('should show impact preview when amount changes', async () => {
      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        const amountInput = screen.getByLabelText(/Valor Total/i)
        fireEvent.change(amountInput, { target: { value: '1500' } })
      })

      await waitFor(() => {
        expect(screen.getByText('O que vai acontecer:')).toBeInTheDocument()
        expect(screen.getByText(/3 parcelas pagas permanecem inalteradas/i)).toBeInTheDocument()
        expect(screen.getByText(/9 parcelas pendentes serão recalculadas/i)).toBeInTheDocument()
        expect(screen.getByText(/Compromissos futuros atualizados/i)).toBeInTheDocument()
      })
    })

    it('should show payments added message when installments increase', async () => {
      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        const installmentsInput = screen.getByLabelText(/Número de Parcelas/i)
        fireEvent.change(installmentsInput, { target: { value: '15' } }) // Add 3
      })

      await waitFor(() => {
        expect(screen.getByText(/3 parcelas adicionadas/i)).toBeInTheDocument()
      })
    })

    it('should show payments removed message when installments decrease', async () => {
      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        const installmentsInput = screen.getByLabelText(/Número de Parcelas/i)
        fireEvent.change(installmentsInput, { target: { value: '10' } }) // Remove 2
      })

      await waitFor(() => {
        expect(screen.getByText(/2 parcelas removidas/i)).toBeInTheDocument()
      })
    })

    it('should show monthly change message when recalculation needed', async () => {
      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        const amountInput = screen.getByLabelText(/Valor Total/i)
        fireEvent.change(amountInput, { target: { value: '1500' } })
      })

      await waitFor(() => {
        expect(screen.getByText(/Valor mensal:/i)).toBeInTheDocument()
      })
    })

    it('should not show impact preview for description-only changes', async () => {
      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        const descriptionInput = screen.getByLabelText(/Descrição/i)
        fireEvent.change(descriptionInput, { target: { value: 'New Description' } })
      })

      await waitFor(() => {
        expect(screen.queryByText('O que vai acontecer:')).not.toBeInTheDocument()
      })
    })
  })

  /**
   * Form Submission Tests
   */
  describe('Form Submission', () => {
    it('should call updateInstallment with changed fields on submit', async () => {
      mockUpdateInstallment.mockResolvedValue({
        success: true,
        updateData: {
          plan_id: 'plan-123',
          fields_changed: ['description'],
          old_amount: 1200,
          new_amount: 1200,
          old_installments: 12,
          new_installments: 12,
          payments_added: 0,
          payments_removed: 0,
          payments_recalculated: 0,
        },
      })

      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        const descriptionInput = screen.getByLabelText(/Descrição/i)
        fireEvent.change(descriptionInput, { target: { value: 'New Description' } })
      })

      const saveButton = screen.getByText('Salvar Alterações')
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(mockUpdateInstallment).toHaveBeenCalledWith('plan-123', {
          description: 'New Description',
        })
      })
    })

    it('should show loading state during submission', async () => {
      mockUpdateInstallment.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
      )

      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        const descriptionInput = screen.getByLabelText(/Descrição/i)
        fireEvent.change(descriptionInput, { target: { value: 'New' } })
      })

      const saveButton = screen.getByText('Salvar Alterações')
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText('Salvando...')).toBeInTheDocument()
      })
    })

    it('should close dialog and call onSuccess on successful save', async () => {
      mockUpdateInstallment.mockResolvedValue({
        success: true,
        updateData: {
          plan_id: 'plan-123',
          fields_changed: ['description'],
          old_amount: 1200,
          new_amount: 1200,
          old_installments: 12,
          new_installments: 12,
          payments_added: 0,
          payments_removed: 0,
          payments_recalculated: 0,
        },
      })

      const onOpenChange = jest.fn()
      const onSuccess = jest.fn()

      render(<EditInstallmentDialog {...defaultProps} onOpenChange={onOpenChange} onSuccess={onSuccess} />)

      await waitFor(() => {
        const descriptionInput = screen.getByLabelText(/Descrição/i)
        fireEvent.change(descriptionInput, { target: { value: 'New' } })
      })

      const saveButton = screen.getByText('Salvar Alterações')
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled()
        expect(onOpenChange).toHaveBeenCalledWith(false)
      })
    })

    it('should show error message on save failure', async () => {
      mockUpdateInstallment.mockResolvedValue({
        success: false,
        error: 'Database error',
      })

      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        const descriptionInput = screen.getByLabelText(/Descrição/i)
        fireEvent.change(descriptionInput, { target: { value: 'New' } })
      })

      const saveButton = screen.getByText('Salvar Alterações')
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText('Database error')).toBeInTheDocument()
      })
    })

    it('should only send changed fields to server', async () => {
      mockUpdateInstallment.mockResolvedValue({
        success: true,
        updateData: {
          plan_id: 'plan-123',
          fields_changed: ['description', 'total_amount'],
          old_amount: 1200,
          new_amount: 1500,
          old_installments: 12,
          new_installments: 12,
          payments_added: 0,
          payments_removed: 0,
          payments_recalculated: 9,
        },
      })

      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        const descriptionInput = screen.getByLabelText(/Descrição/i)
        const amountInput = screen.getByLabelText(/Valor Total/i)

        fireEvent.change(descriptionInput, { target: { value: 'New Description' } })
        fireEvent.change(amountInput, { target: { value: '1500' } })
      })

      const saveButton = screen.getByText('Salvar Alterações')
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(mockUpdateInstallment).toHaveBeenCalledWith('plan-123', {
          description: 'New Description',
          total_amount: 1500,
        })
      })

      // Should NOT send unchanged fields like merchant, category, installments
      expect(mockUpdateInstallment).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ merchant: expect.anything() })
      )
    })
  })

  /**
   * Cancel & Close Tests
   */
  describe('Cancel & Close Behavior', () => {
    it('should show unsaved changes warning when cancelling with changes', async () => {
      const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false)

      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        const descriptionInput = screen.getByLabelText(/Descrição/i)
        fireEvent.change(descriptionInput, { target: { value: 'Changed' } })
      })

      const cancelButton = screen.getByText('Cancelar')
      fireEvent.click(cancelButton)

      expect(confirmSpy).toHaveBeenCalledWith('Você tem alterações não salvas. Descartar?')

      confirmSpy.mockRestore()
    })

    it('should close dialog without warning if no changes', async () => {
      const onOpenChange = jest.fn()
      const confirmSpy = jest.spyOn(window, 'confirm')

      render(<EditInstallmentDialog {...defaultProps} onOpenChange={onOpenChange} />)

      await waitFor(() => {
        const cancelButton = screen.getByText('Cancelar')
        fireEvent.click(cancelButton)
      })

      expect(confirmSpy).not.toHaveBeenCalled()
      expect(onOpenChange).toHaveBeenCalledWith(false)

      confirmSpy.mockRestore()
    })

    it('should disable buttons during save', async () => {
      mockUpdateInstallment.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
      )

      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        const descriptionInput = screen.getByLabelText(/Descrição/i)
        fireEvent.change(descriptionInput, { target: { value: 'New' } })
      })

      const saveButton = screen.getByText('Salvar Alterações')
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText('Cancelar')).toBeDisabled()
        expect(screen.getByText('Salvando...')).toBeDisabled()
      })
    })
  })

  /**
   * Accessibility Tests
   */
  describe('Accessibility', () => {
    it('should have proper aria labels on form fields', async () => {
      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByLabelText(/Descrição/i)).toHaveAttribute('id', 'description')
        expect(screen.getByLabelText(/Valor Total/i)).toHaveAttribute('id', 'total_amount')
        expect(screen.getByLabelText(/Número de Parcelas/i)).toHaveAttribute('id', 'total_installments')
      })
    })

    it('should show validation errors below fields', async () => {
      render(<EditInstallmentDialog {...defaultProps} />)

      await waitFor(() => {
        const amountInput = screen.getByLabelText(/Valor Total/i)
        fireEvent.change(amountInput, { target: { value: '0' } })
        fireEvent.blur(amountInput)
      })

      await waitFor(() => {
        const errorMessage = screen.getByText('Valor deve ser maior que zero')
        const amountInput = screen.getByLabelText(/Valor Total/i)

        // Error should be visually near the input
        expect(errorMessage).toBeInTheDocument()
        expect(amountInput).toBeInTheDocument()
      })
    })
  })
})
