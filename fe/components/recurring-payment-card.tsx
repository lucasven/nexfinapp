"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import type { RecurringPayment } from "@/lib/types"
import { format } from "date-fns"
import { markPaymentAsPaid } from "@/lib/actions/recurring"
import { useRouter } from "next/navigation"

interface RecurringPaymentCardProps {
  payment: RecurringPayment & {
    recurring_transaction?: {
      amount: number
      type: "income" | "expense"
      description: string | null
      category?: {
        name: string
        icon: string | null
      }
    }
  }
}

export function RecurringPaymentCard({ payment }: RecurringPaymentCardProps) {
  const router = useRouter()

  const handleToggle = async (checked: boolean) => {
    try {
      await markPaymentAsPaid(payment.id, checked)
      router.refresh()
    } catch (error) {
      console.error("Error updating payment:", error)
    }
  }

  const isOverdue = new Date(payment.due_date) < new Date() && !payment.is_paid

  return (
    <Card className={isOverdue ? "border-red-300" : ""}>
      <CardContent className="flex items-center gap-4 p-4">
        <Checkbox checked={payment.is_paid} onCheckedChange={handleToggle} className="h-5 w-5" />

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{payment.recurring_transaction?.category?.icon}</span>
            <span className="font-medium">
              {payment.recurring_transaction?.description || payment.recurring_transaction?.category?.name}
            </span>
          </div>
          <div className="text-sm text-muted-foreground">
            Due: {format(new Date(payment.due_date), "MMM dd, yyyy")}
            {isOverdue && <span className="text-red-600 ml-2 font-medium">Overdue</span>}
          </div>
        </div>

        <div
          className={`text-lg font-semibold ${
            payment.recurring_transaction?.type === "income" ? "text-green-600" : "text-red-600"
          }`}
        >
          {payment.recurring_transaction?.type === "income" ? "+" : "-"}
          R$ {payment.recurring_transaction?.amount.toFixed(2)}
        </div>
      </CardContent>
    </Card>
  )
}
