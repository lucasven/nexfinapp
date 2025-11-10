import { RecurringDialog } from "@/components/recurring-dialog"
import { RecurringPaymentCard } from "@/components/recurring-payment-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UserMenu } from "@/components/user-menu"
import { getRecurringPayments, getRecurringTransactions, deleteRecurringTransaction } from "@/lib/actions/recurring"
import { getCategories } from "@/lib/actions/categories"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { ArrowLeftIcon, EditIcon, TrashIcon } from "lucide-react"
import Link from "next/link"

export default async function RecurringPage() {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const currentDate = new Date()
  const currentMonth = currentDate.getMonth() + 1
  const currentYear = currentDate.getFullYear()

  const [recurringTransactions, payments, categories] = await Promise.all([
    getRecurringTransactions(),
    getRecurringPayments(currentMonth, currentYear),
    getCategories(),
  ])

  const monthName = new Date(currentYear, currentMonth - 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  })

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/">
              <ArrowLeftIcon className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight">Recurring Transactions</h1>
            <p className="text-muted-foreground mt-1">Manage your monthly recurring expenses and income</p>
          </div>
          <RecurringDialog categories={categories} />
          <UserMenu userEmail={user?.email} displayName={user?.user_metadata?.display_name} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Upcoming Payments */}
          <Card>
            <CardHeader>
              <CardTitle>Payments for {monthName}</CardTitle>
              <CardDescription>Mark payments as paid when completed</CardDescription>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No recurring payments scheduled</p>
              ) : (
                <div className="space-y-3">
                  {payments.map((payment) => (
                    <RecurringPaymentCard key={payment.id} payment={payment} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recurring Templates */}
          <Card>
            <CardHeader>
              <CardTitle>Recurring Templates</CardTitle>
              <CardDescription>Manage your recurring transaction templates</CardDescription>
            </CardHeader>
            <CardContent>
              {recurringTransactions.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No recurring transactions set up</p>
                  <RecurringDialog categories={categories} trigger={<Button>Create Recurring Transaction</Button>} />
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead>Day</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recurringTransactions.map((recurring) => (
                        <TableRow key={recurring.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span>{recurring.category?.icon}</span>
                              <span className="font-medium">{recurring.description || recurring.category?.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>Day {recurring.day_of_month}</TableCell>
                          <TableCell className="text-right">
                            <span
                              className={
                                recurring.type === "income"
                                  ? "text-green-600 font-semibold"
                                  : "text-red-600 font-semibold"
                              }
                            >
                              {recurring.type === "income" ? "+" : "-"}R$ {recurring.amount.toFixed(2)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <RecurringDialog
                                categories={categories}
                                recurring={recurring}
                                trigger={
                                  <Button variant="ghost" size="icon">
                                    <EditIcon className="h-4 w-4" />
                                  </Button>
                                }
                              />
                              <form action={deleteRecurringTransaction.bind(null, recurring.id)}>
                                <Button variant="ghost" size="icon" type="submit">
                                  <TrashIcon className="h-4 w-4" />
                                </Button>
                              </form>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
