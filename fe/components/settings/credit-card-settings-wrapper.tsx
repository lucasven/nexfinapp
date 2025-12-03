import { getPaymentMethods } from '@/lib/actions/payment-methods'
import { CreditCardSettings } from './credit-card-settings'

/**
 * Credit Card Settings Wrapper (Server Component)
 *
 * Story: 1-5-mode-switching-with-data-implications-warning
 *
 * This server component fetches payment methods and passes them to the
 * client CreditCardSettings component.
 */
export async function CreditCardSettingsWrapper() {
  const paymentMethods = await getPaymentMethods()

  return <CreditCardSettings paymentMethods={paymentMethods} />
}
