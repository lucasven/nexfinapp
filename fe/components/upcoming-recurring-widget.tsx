"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CalendarIcon, CheckCircle2Icon, AlertCircleIcon } from "lucide-react"
import { useTranslations, useLocale } from "next-intl"
import { formatCurrency } from "@/lib/localization/format"
import Link from "next/link"
import { markPaymentAsPaid } from "@/lib/actions/recurring"
import { useState, useTransition } from "react"
import { toast } from "sonner"

interface RecurringPayment {
  id: string
  due_date: string
  is_paid: boolean
  recurring_transaction: {
    amount: number
    type: "income" | "expense"
    description: string | null
    category: {
      name: string
      icon: string
    }
  }
}

interface UpcomingRecurringWidgetProps {
  payments: RecurringPayment[]
}

export function UpcomingRecurringWidget({ payments }: UpcomingRecurringWidgetProps) {
  const t = useTranslations()
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()
  const [paidPayments, setPaidPayments] = useState<Set<string>>(new Set())

  // Separate overdue and upcoming
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const overduePayments = payments.filter((p) => {
    const dueDate = new Date(p.due_date)
    dueDate.setHours(0, 0, 0, 0)
    return dueDate < today && !p.is_paid && !paidPayments.has(p.id)
  })

  const upcomingPayments = payments.filter((p) => {
    const dueDate = new Date(p.due_date)
    dueDate.setHours(0, 0, 0, 0)
    return dueDate >= today && !p.is_paid && !paidPayments.has(p.id)
  })

  // Calculate totals
  const overdueAmount = overduePayments.reduce((sum, p) => {
    return p.recurring_transaction.type === "expense"
      ? sum + p.recurring_transaction.amount
      : sum - p.recurring_transaction.amount
  }, 0)

  const upcomingAmount = upcomingPayments.reduce((sum, p) => {
    return p.recurring_transaction.type === "expense"
      ? sum + p.recurring_transaction.amount
      : sum - p.recurring_transaction.amount
  }, 0)

  const handleMarkAsPaid = (paymentId: string) => {
    startTransition(async () => {
      try {
        await markPaymentAsPaid(paymentId, true)
        setPaidPayments((prev) => new Set(prev).add(paymentId))
        toast.success(t("recurring.paymentMarkedAsPaid"))
      } catch (error) {
        toast.error(t("recurring.errorMarkingPayment"))
        console.error("Error marking payment as paid:", error)
      }
    })
  }

  // Don't show widget if no payments
  if (overduePayments.length === 0 && upcomingPayments.length === 0) {
    return null
  }

  return (
    <Card className="col-span-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base font-medium">
            {t("recurring.upcomingPayments")}
          </CardTitle>
          {overduePayments.length > 0 && (
            <Badge variant="destructive" className="ml-2">
              {overduePayments.length} {t("recurring.overdueLabel")}
            </Badge>
          )}
          {upcomingPayments.length > 0 && (
            <Badge variant="secondary">
              {upcomingPayments.length} {t("recurring.upcoming")}
            </Badge>
          )}
        </div>
        <Link href="/recurring">
          <Button variant="ghost" size="sm">
            {t("recurring.viewAll")}
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Overdue Payments */}
          {overduePayments.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertCircleIcon className="h-4 w-4" />
                <span>
                  {t("recurring.overduePayments")} ({overduePayments.length})
                </span>
                <span className="ml-auto font-bold">
                  {formatCurrency(overdueAmount, locale as "pt-br" | "en")}
                </span>
              </div>
              <div className="space-y-2">
                {overduePayments.slice(0, 3).map((payment) => (
                  <PaymentRow
                    key={payment.id}
                    payment={payment}
                    locale={locale as "pt-br" | "en"}
                    isOverdue
                    onMarkAsPaid={() => handleMarkAsPaid(payment.id)}
                    isPending={isPending}
                  />
                ))}
                {overduePayments.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center py-1">
                    {t("recurring.andXMore", { count: overduePayments.length - 3 })}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Upcoming Payments */}
          {upcomingPayments.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <span>
                  {t("recurring.upcomingThisMonth")} ({upcomingPayments.length})
                </span>
                <span className="ml-auto font-bold">
                  {formatCurrency(upcomingAmount, locale as "pt-br" | "en")}
                </span>
              </div>
              <div className="space-y-2">
                {upcomingPayments.slice(0, 3).map((payment) => (
                  <PaymentRow
                    key={payment.id}
                    payment={payment}
                    locale={locale as "pt-br" | "en"}
                    onMarkAsPaid={() => handleMarkAsPaid(payment.id)}
                    isPending={isPending}
                  />
                ))}
                {upcomingPayments.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center py-1">
                    {t("recurring.andXMore", { count: upcomingPayments.length - 3 })}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface PaymentRowProps {
  payment: RecurringPayment
  locale: "pt-br" | "en"
  isOverdue?: boolean
  onMarkAsPaid: () => void
  isPending: boolean
}

function PaymentRow({ payment, locale, isOverdue, onMarkAsPaid, isPending }: PaymentRowProps) {
  const t = useTranslations()
  const { recurring_transaction: rt } = payment

  // Format date
  const dueDate = new Date(payment.due_date)
  const dateStr = dueDate.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  })

  // Calculate days until/past due
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(payment.due_date)
  due.setHours(0, 0, 0, 0)
  const daysDiff = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  let daysLabel = ""
  if (daysDiff === 0) {
    daysLabel = t("recurring.dueToday")
  } else if (daysDiff === 1) {
    daysLabel = t("recurring.dueTomorrow")
  } else if (daysDiff < 0) {
    daysLabel = t("recurring.daysOverdue", { count: Math.abs(daysDiff) })
  } else {
    daysLabel = t("recurring.daysUntilDue", { count: daysDiff })
  }

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border ${isOverdue ? "border-destructive/50 bg-destructive/5" : "border-border bg-muted/30"}`}
    >
      <div className="flex-shrink-0 text-2xl">{rt.category.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{rt.category.name}</p>
          {rt.description && (
            <p className="text-xs text-muted-foreground truncate">• {rt.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-muted-foreground">{dateStr}</p>
          <span className="text-xs text-muted-foreground">•</span>
          <p className={`text-xs ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
            {daysLabel}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <p className={`text-sm font-bold ${rt.type === "expense" ? "text-red-600" : "text-green-600"}`}>
          {formatCurrency(rt.amount, locale)}
        </p>
        <Button
          size="sm"
          variant={isOverdue ? "default" : "outline"}
          className="flex-shrink-0"
          onClick={onMarkAsPaid}
          disabled={isPending}
        >
          <CheckCircle2Icon className="h-4 w-4 mr-1" />
          {t("recurring.markPaid")}
        </Button>
      </div>
    </div>
  )
}
