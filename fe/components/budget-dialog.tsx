"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createBudget, createDefaultBudget, updateBudget } from "@/lib/actions/budgets"
import type { Budget, Category } from "@/lib/types"
import { PlusIcon, CalendarIcon, RepeatIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from 'next-intl'

interface BudgetDialogProps {
  categories: Category[]
  budget?: Budget & { spent?: number; remaining?: number; percentage?: number }
  trigger?: React.ReactNode
  currentMonth: number
  currentYear: number
  defaultMode?: boolean  // When true, dialog opens in default budget mode
}

export function BudgetDialog({ categories, budget, trigger, currentMonth, currentYear, defaultMode = false }: BudgetDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isDefault, setIsDefault] = useState(budget?.is_default ?? defaultMode)
  const [formData, setFormData] = useState({
    category_id: budget?.category_id || "",
    amount: budget?.amount?.toString() || "",
    month: budget?.month || currentMonth,
    year: budget?.year || currentYear,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const amount = Number.parseFloat(formData.amount)

      if (budget) {
        // Update existing budget
        const updateData = isDefault
          ? { category_id: formData.category_id, amount }
          : { ...formData, amount }
        await updateBudget(budget.id, updateData)
      } else {
        // Create new budget
        if (isDefault) {
          await createDefaultBudget({
            category_id: formData.category_id,
            amount,
          })
        } else {
          await createBudget({
            category_id: formData.category_id,
            amount,
            month: formData.month,
            year: formData.year,
          })
        }
      }

      setOpen(false)
      router.refresh()
    } catch (error) {
      console.error("Error saving budget:", error)
    } finally {
      setLoading(false)
    }
  }

  const expenseCategories = categories.filter((c) => c.type === "expense")

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <PlusIcon className="h-4 w-4 mr-2" />
            {t('budget.addTitle')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{budget ? t('budget.editTitle') : t('budget.addGoalTitle')}</DialogTitle>
            <DialogDescription>
              {budget ? t('budget.editDescription') : t('budget.addGoalDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Budget Type Toggle - only show when creating new budget */}
            {!budget && (
              <div className="grid gap-2">
                <Label>{t('budget.budgetType')}</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={isDefault ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setIsDefault(true)}
                  >
                    <RepeatIcon className="h-4 w-4 mr-2" />
                    {t('budget.fixedDefault')}
                  </Button>
                  <Button
                    type="button"
                    variant={!isDefault ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setIsDefault(false)}
                  >
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {t('budget.monthlyOverride')}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isDefault ? t('budget.defaultBudgetInfo') : t('budget.overrideBudgetInfo')}
                </p>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="category">{t('transaction.category')}</Label>
              <Select
                value={formData.category_id}
                onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                required
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder={t('budget.selectCategory')} />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.icon} {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="amount">{t('budget.budgetLimit')}</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                required
              />
            </div>

            {/* Month/Year selectors - only show for monthly (non-default) budgets */}
            {!isDefault && (
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="month">{t('budget.month')}</Label>
                  <Select
                    value={formData.month.toString()}
                    onValueChange={(value) => setFormData({ ...formData, month: Number.parseInt(value) })}
                  >
                    <SelectTrigger id="month">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                        <SelectItem key={month} value={month.toString()}>
                          {new Date(2000, month - 1).toLocaleString(t('common.locale') as string, { month: "long" })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="year">{t('budget.year')}</Label>
                  <Select
                    value={formData.year.toString()}
                    onValueChange={(value) => setFormData({ ...formData, year: Number.parseInt(value) })}
                  >
                    <SelectTrigger id="year">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 5 }, (_, i) => currentYear - 1 + i).map((year) => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t('common.saving') : budget ? t('common.update') : t('common.add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
