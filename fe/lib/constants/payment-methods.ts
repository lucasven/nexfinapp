/**
 * Default payment method suggestions
 * These are shown in the transaction dialog when user has no payment methods
 */
export const DEFAULT_PAYMENT_METHODS = [
  { name: 'Cartão de Crédito', nameEn: 'Credit Card', type: 'credit' as const, icon: '💳' },
  { name: 'Cartão de Débito', nameEn: 'Debit Card', type: 'debit' as const, icon: '💳' },
  { name: 'PIX', nameEn: 'PIX', type: 'pix' as const, icon: '📱' },
  { name: 'Dinheiro', nameEn: 'Cash', type: 'cash' as const, icon: '💵' },
] as const

export type PaymentMethodType = 'credit' | 'debit' | 'cash' | 'pix' | 'other'
