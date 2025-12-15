import { Metadata } from "next"
import { redirect } from "next/navigation"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { getCategories, deleteCategory, checkCategoryUsage } from "@/lib/actions/categories"
import { CategoriesClient } from "./categories-client"
import { Header } from "@/components/header"
import { getPaymentMethods } from "@/lib/actions/payment-methods"
import { checkIsAdmin } from "@/lib/actions/admin"

export const metadata: Metadata = {
  title: "Categories | Expense Tracker",
  description: "Manage your expense and income categories",
}

export default async function CategoriesPage() {
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Fetch data needed for header
  const [allCategories, paymentMethods, isAdmin] = await Promise.all([
    getCategories(),
    getPaymentMethods(),
    checkIsAdmin()
  ])

  return (
    <div className="min-h-screen bg-background">
      <Header
        userEmail={user?.email}
        displayName={user?.user_metadata?.display_name}
        isAdmin={isAdmin}
        categories={allCategories}
        paymentMethods={paymentMethods}
      />

      <div className="container mx-auto py-8 px-4">
        <CategoriesClient
          categories={allCategories}
          userId={user.id}
          userEmail={user.email}
          displayName={user.user_metadata?.display_name}
        />
      </div>
    </div>
  )
}

