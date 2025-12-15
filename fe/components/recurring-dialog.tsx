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
import { Textarea } from "@/components/ui/textarea"
import { createRecurringTransaction, updateRecurringTransaction } from "@/lib/actions/recurring"
import type { Category, RecurringTransaction } from "@/lib/types"
import { PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from 'next-intl'

interface RecurringDialogProps {
  categories: Category[]
  recurring?: RecurringTransaction
  trigger?: React.ReactNode
}

export function RecurringDialog({ categories, recurring, trigger }: RecurringDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    amount: recurring?.amount.toString() || "",
    type: recurring?.type || ("expense" as "income" | "expense"),
    category_id: recurring?.category_id || "",
    description: recurring?.description || "",
    payment_method: recurring?.payment_method || "",
    day_of_month: recurring?.day_of_month.toString() || "1",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const data = {
        ...formData,
        amount: Number.parseFloat(formData.amount),
        day_of_month: Number.parseInt(formData.day_of_month),
      }

      if (recurring) {
        await updateRecurringTransaction(recurring.id, data)
      } else {
        await createRecurringTransaction(data)
      }

      setOpen(false)
      router.refresh()
    } catch (error) {
      console.error("Error saving recurring transaction:", error)
    } finally {
      setLoading(false)
    }
  }

  const filteredCategories = categories.filter((c) => c.type === formData.type)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <PlusIcon className="h-4 w-4 mr-2" />
            {t('recurring.addTitle')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{recurring ? t('recurring.editTransactionTitle') : t('recurring.addTransactionTitle')}</DialogTitle>
            <DialogDescription>
              {recurring ? t('recurring.editTransactionDescription') : t('recurring.addTransactionDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="type">{t('transaction.type')}</Label>
              <Select
                value={formData.type}
                onValueChange={(value: "income" | "expense") => {
                  setFormData({ ...formData, type: value, category_id: "" })
                }}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">{t('transaction.income')}</SelectItem>
                  <SelectItem value="expense">{t('transaction.expense')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="amount">{t('recurring.amount')}</Label>
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

            <div className="grid gap-2">
              <Label htmlFor="category">{t('transaction.category')}</Label>
              <Select
                value={formData.category_id}
                onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                required
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder={t('transaction.selectCategory')} />
                </SelectTrigger>
                <SelectContent>
                  {filteredCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.icon} {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="day_of_month">{t('recurring.dayOfMonth')}</Label>
              <Select
                value={formData.day_of_month}
                onValueChange={(value) => setFormData({ ...formData, day_of_month: value })}
                required
              >
                <SelectTrigger id="day_of_month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <SelectItem key={day} value={day.toString()}>
                      {t('recurring.day')} {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="payment_method">{t('transaction.paymentMethod')}</Label>
              <Select
                value={formData.payment_method}
                onValueChange={(value) => setFormData({ ...formData, payment_method: value })}
              >
                <SelectTrigger id="payment_method">
                  <SelectValue placeholder={t('recurring.selectPaymentMethod')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t('paymentMethodTypes.cash')}</SelectItem>
                  <SelectItem value="credit_card">{t('paymentMethodTypes.creditCard')}</SelectItem>
                  <SelectItem value="debit_card">{t('paymentMethodTypes.debitCard')}</SelectItem>
                  <SelectItem value="bank_transfer">{t('paymentMethodTypes.bankTransfer')}</SelectItem>
                  <SelectItem value="pix">{t('paymentMethodTypes.pix')}</SelectItem>
                  <SelectItem value="other">{t('paymentMethodTypes.other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">{t('transaction.description')}</Label>
              <Textarea
                id="description"
                placeholder={t('recurring.descriptionPlaceholder')}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t('common.saving') : recurring ? t('common.update') : t('common.add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
