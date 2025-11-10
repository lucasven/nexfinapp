import { Metadata } from "next"
import { redirect } from "next/navigation"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { getCategories, deleteCategory, checkCategoryUsage } from "@/lib/actions/categories"
import { CategoriesClient } from "./categories-client"

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

  const categories = await getCategories()

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4">
        <CategoriesClient categories={categories} userId={user.id} />
      </div>
    </div>
  )
}

