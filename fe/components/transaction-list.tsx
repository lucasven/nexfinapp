"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Category, Transaction } from "@/lib/types"
import { format } from "date-fns"
import { EditIcon, SearchIcon, TrashIcon } from "lucide-react"
import { TransactionDialog } from "./transaction-dialog"
import { deleteTransaction } from "@/lib/actions/transactions"
import { useRouter } from "next/navigation"

interface TransactionListProps {
  transactions: Transaction[]
  categories: Category[]
}

export function TransactionList({ transactions, categories }: TransactionListProps) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")

  const filteredTransactions = transactions.filter((transaction) => {
    const matchesSearch = transaction.description?.toLowerCase().includes(search.toLowerCase()) ?? true
    const matchesType = typeFilter === "all" || transaction.type === typeFilter
    const matchesCategory = categoryFilter === "all" || transaction.category_id === categoryFilter
    return matchesSearch && matchesType && matchesCategory
  })

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this transaction?")) {
      try {
        await deleteTransaction(id)
        router.refresh()
      } catch (error) {
        console.error("Error deleting transaction:", error)
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transactions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4 mb-4 md:flex-row">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search transactions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full md:w-[200px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.icon} {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No transactions found
                  </TableCell>
                </TableRow>
              ) : (
                filteredTransactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="font-medium">{format(new Date(transaction.date), "MMM dd, yyyy")}</TableCell>
                    <TableCell>{transaction.description || "-"}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1">
                        {transaction.category?.icon} {transaction.category?.name}
                      </span>
                    </TableCell>
                    <TableCell className="capitalize">{transaction.payment_method?.replace("_", " ") || "-"}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          transaction.type === "income" ? "text-green-600 font-semibold" : "text-red-600 font-semibold"
                        }
                      >
                        {transaction.type === "income" ? "+" : "-"}R$ {transaction.amount.toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <TransactionDialog
                          categories={categories}
                          transaction={transaction}
                          trigger={
                            <Button variant="ghost" size="icon">
                              <EditIcon className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(transaction.id)}>
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
