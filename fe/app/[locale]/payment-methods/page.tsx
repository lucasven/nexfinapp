import { Header } from "@/components/header"
import { PaymentMethodsList } from "@/components/payment-methods/payment-methods-list"
import { getPaymentMethods } from "@/lib/actions/payment-methods"
import { getCategories } from "@/lib/actions/categories"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { checkIsAdmin } from "@/lib/actions/admin"

export default async function PaymentMethodsPage() {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [allPaymentMethods, categories, isAdmin] = await Promise.all([
    getPaymentMethods(),
    getCategories(),
    checkIsAdmin()
  ])

  // Filter to only non-credit payment methods (exclude credit/debit cards)
  // Credit cards are managed in /credit-cards
  const paymentMethods = allPaymentMethods.filter(pm =>
    pm.type !== 'credit' && pm.type !== 'debit'
  )

  return (
    <div className="min-h-screen bg-background">
      <Header
        userEmail={user?.email}
        displayName={user?.user_metadata?.display_name}
        isAdmin={isAdmin}
        categories={categories}
        paymentMethods={allPaymentMethods}
      />

      <div className="container mx-auto py-8 px-4">
        <PaymentMethodsList paymentMethods={paymentMethods} />
      </div>
    </div>
  )
}
