import { Header } from "@/components/header"
import { CreditCardsList } from "@/components/credit-cards/credit-cards-list"
import { getPaymentMethods } from "@/lib/actions/payment-methods"
import { getCategories } from "@/lib/actions/categories"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { checkIsAdmin } from "@/lib/actions/admin"

export default async function CreditCardsPage() {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [paymentMethods, categories, isAdmin] = await Promise.all([
    getPaymentMethods(),
    getCategories(),
    checkIsAdmin()
  ])

  // Filter to only credit/debit cards (exclude bank accounts)
  const creditCards = paymentMethods.filter(pm => pm.type === 'credit' || pm.type === 'debit')

  return (
    <div className="min-h-screen bg-background">
      <Header
        userEmail={user?.email}
        displayName={user?.user_metadata?.display_name}
        isAdmin={isAdmin}
        categories={categories}
        paymentMethods={paymentMethods}
      />

      <div className="container mx-auto py-8 px-4">
        <CreditCardsList creditCards={creditCards} />
      </div>
    </div>
  )
}
