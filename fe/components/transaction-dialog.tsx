"use client"

import type React from "react"

import { useState, useEffect } from "react"
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
import { createTransaction, updateTransaction } from "@/lib/actions/transactions"
import type { Category, Transaction } from "@/lib/types"
import { PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from 'next-intl'
import { translateCategoryName } from '@/lib/localization/category-translations'
import { trackEvent } from '@/lib/analytics/tracker'
import { AnalyticsEvent } from '@/lib/analytics/events'

interface TransactionDialogProps {
  categories: Category[]
  transaction?: Transaction
  trigger?: React.ReactNode
}

export function TransactionDialog({ categories, transaction, trigger }: TransactionDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    amount: transaction?.amount.toString() || "",
    type: transaction?.type || ("expense" as "income" | "expense"),
    category_id: transaction?.category_id || "",
    description: transaction?.description || "",
    date: transaction?.date || new Date().toISOString().split("T")[0],
    payment_method: transaction?.payment_method || "",
  })

  // Track when dialog opens
  useEffect(() => {
    if (open) {
      trackEvent(AnalyticsEvent.TRANSACTION_DIALOG_OPENED, {
        is_edit: !!transaction,
      })
    }
  }, [open, transaction])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const data = {
        ...formData,
        amount: Number.parseFloat(formData.amount),
      }

      if (transaction) {
        await updateTransaction(transaction.id, data)
      } else {
        await createTransaction(data)
      }

      setOpen(false)
      router.refresh()
    } catch (error) {
      console.error("Error saving transaction:", error)
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
            {t('home.addTransaction')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{transaction ? t('transaction.editTitle') : t('transaction.addTitle')}</DialogTitle>
            <DialogDescription>
              {transaction ? t('transaction.editDescription') : t('transaction.addDescription')}
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
              <Label htmlFor="amount">{t('transaction.amount')}</Label>
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
              <Label htmlFor="date">{t('transaction.date')}</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="payment_method">{t('transaction.paymentMethod')}</Label>
              <Select
                value={formData.payment_method}
                onValueChange={(value) => setFormData({ ...formData, payment_method: value })}
              >
                <SelectTrigger id="payment_method">
                  <SelectValue placeholder={t('transaction.selectPaymentMethod')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t('paymentMethods.cash')}</SelectItem>
                  <SelectItem value="credit_card">{t('paymentMethods.creditCard')}</SelectItem>
                  <SelectItem value="debit_card">{t('paymentMethods.debitCard')}</SelectItem>
                  <SelectItem value="bank_transfer">{t('paymentMethods.bankTransfer')}</SelectItem>
                  <SelectItem value="pix">{t('paymentMethods.pix')}</SelectItem>
                  <SelectItem value="other">{t('paymentMethods.other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">{t('transaction.description')}</Label>
              <Textarea
                id="description"
                placeholder={t('transaction.optionalDescription')}
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
              {loading ? t('common.saving') : transaction ? t('common.update') : t('common.add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
