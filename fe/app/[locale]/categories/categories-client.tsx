"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from 'next-intl'
import { PencilIcon, Trash2Icon, PlusIcon, AlertCircleIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CategoryDialog } from "@/components/category-dialog"
import { deleteCategory } from "@/lib/actions/categories"
import { Category } from "@/lib/types"

interface CategoriesClientProps {
  categories: Category[]
  userId: string
}

export function CategoriesClient({ categories, userId }: CategoriesClientProps) {
  const t = useTranslations()
  const router = useRouter()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const incomeCategories = categories.filter((c) => c.type === "income")
  const expenseCategories = categories.filter((c) => c.type === "expense")

  const handleDeleteClick = (category: Category) => {
    if (!category.is_custom) {
      return
    }
    setCategoryToDelete(category)
    setDeleteDialogOpen(true)
    setDeleteError(null)
  }

  const handleDeleteConfirm = async () => {
    if (!categoryToDelete) return

    setDeleteLoading(true)
    setDeleteError(null)

    try {
      await deleteCategory(categoryToDelete.id)
      setDeleteDialogOpen(false)
      setCategoryToDelete(null)
      router.refresh()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete category")
    } finally {
      setDeleteLoading(false)
    }
  }

  const renderCategory = (category: Category) => {
    const isCustom = category.is_custom
    const isOwned = category.user_id === userId

    return (
      <div
        key={category.id}
        className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {category.icon && <span className="text-2xl">{category.icon}</span>}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{category.name}</span>
              {isCustom && (
                <Badge variant="secondary" className="text-xs">
                  {t('common.custom')}
                </Badge>
              )}
            </div>
            {category.color && (
              <div className="flex items-center gap-2 mt-1">
                <div className="w-4 h-4 rounded-full border" style={{ backgroundColor: category.color }} />
                <span className="text-xs text-muted-foreground">{category.color}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <CategoryDialog
            category={category}
            trigger={
              <Button variant="ghost" size="sm">
                <PencilIcon className="h-4 w-4" />
              </Button>
            }
          />
          {isCustom && isOwned && (
            <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(category)}>
              <Trash2Icon className="h-4 w-4 text-destructive" />
            </Button>
          )}
          {!isCustom && (
            <Button variant="ghost" size="sm" disabled title={t('category.cannotDelete')}>
              <Trash2Icon className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('category.categories')}</h1>
          <p className="text-muted-foreground mt-1">{t('category.subtitle')}</p>
        </div>
        <CategoryDialog />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="text-green-600">💰</span>
              {t('category.income')}
            </CardTitle>
            <CardDescription>{t('category.incomeDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {incomeCategories.length > 0 ? (
              incomeCategories.map(renderCategory)
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">{t('category.noIncome')}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="text-red-600">💸</span>
              {t('category.expense')}
            </CardTitle>
            <CardDescription>{t('category.expenseDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {expenseCategories.length > 0 ? (
              expenseCategories.map(renderCategory)
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">{t('category.noExpense')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('category.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('category.deleteConfirm')} "{categoryToDelete?.name}"?
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <div className="flex items-start gap-2 text-sm text-red-500 bg-red-50 p-3 rounded-md border border-red-200">
              <AlertCircleIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{deleteError}</span>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleteLoading}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleteLoading}>
              {deleteLoading ? t('common.deleting') : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

