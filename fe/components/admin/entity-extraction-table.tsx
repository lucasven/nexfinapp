"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

interface EntityExtractionData {
  intent: string
  entityType: string
  count: number
  percentage: number
}

interface EntityExtractionTableProps {
  data: EntityExtractionData[]
}

const INTENT_LABELS: Record<string, string> = {
  add_expense: "Add Expense",
  add_income: "Add Income",
  show_expenses: "Show Expenses",
  edit_transaction: "Edit Transaction",
  set_budget: "Set Budget",
  // Add more as needed
}

const ENTITY_LABELS: Record<string, string> = {
  amount: "Amount",
  category: "Category",
  date: "Date",
  paymentMethod: "Payment Method",
  description: "Description",
  budgetAmount: "Budget Amount",
  period: "Period",
  // Add more as needed
}

export function EntityExtractionTable({ data }: EntityExtractionTableProps) {
  // Group by intent
  const groupedData = data.reduce((acc, item) => {
    if (!acc[item.intent]) {
      acc[item.intent] = []
    }
    acc[item.intent].push(item)
    return acc
  }, {} as Record<string, EntityExtractionData[]>)

  return (
    <div className="space-y-6">
      {Object.entries(groupedData).map(([intent, entities]) => (
        <div key={intent} className="space-y-2">
          <h4 className="text-sm font-semibold">
            {INTENT_LABELS[intent] || intent}
          </h4>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity Type</TableHead>
                  <TableHead className="text-right">Extraction Count</TableHead>
                  <TableHead className="text-right">Frequency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entities.map((entity, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">
                      {ENTITY_LABELS[entity.entityType] || entity.entityType}
                    </TableCell>
                    <TableCell className="text-right">
                      {entity.count.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">
                        {entity.percentage}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}

      {Object.keys(groupedData).length === 0 && (
        <div className="text-center text-muted-foreground py-8">
          No entity extraction data available yet.
          <br />
          <span className="text-xs">
            This will populate once messages with entities are processed.
          </span>
        </div>
      )}
    </div>
  )
}
