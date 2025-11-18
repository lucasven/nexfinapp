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

interface RetryPattern {
  failedMessage: string
  failedIntent: string | null
  successfulMessage: string
  successfulIntent: string
  retryTimeSeconds: number
  userId: string
}

interface RetryPatternsTableProps {
  patterns: RetryPattern[]
}

const INTENT_LABELS: Record<string, string> = {
  add_expense: "Add Expense",
  add_income: "Add Income",
  show_expenses: "Show Expenses",
  unknown: "Unknown",
  // Add more as needed
}

export function RetryPatternsTable({ patterns }: RetryPatternsTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Failed Attempt</TableHead>
            <TableHead>Successful Retry</TableHead>
            <TableHead>Intent Change</TableHead>
            <TableHead className="text-right">Retry Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {patterns.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No retry patterns found
              </TableCell>
            </TableRow>
          ) : (
            patterns.map((pattern, index) => {
              const intentChanged = pattern.failedIntent !== pattern.successfulIntent

              return (
                <TableRow key={index}>
                  <TableCell className="max-w-xs">
                    <div className="font-mono text-xs bg-muted p-2 rounded truncate">
                      {pattern.failedMessage}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {pattern.failedIntent ? (
                        <span className="text-red-600">
                          ✗ {INTENT_LABELS[pattern.failedIntent] || pattern.failedIntent}
                        </span>
                      ) : (
                        <span className="text-red-600">✗ Failed to parse</span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="max-w-xs">
                    <div className="font-mono text-xs bg-green-50 dark:bg-green-950 p-2 rounded truncate">
                      {pattern.successfulMessage}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      <span className="text-green-600">
                        ✓ {INTENT_LABELS[pattern.successfulIntent] || pattern.successfulIntent}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell>
                    {intentChanged ? (
                      <Badge variant="destructive">Intent Changed</Badge>
                    ) : (
                      <Badge variant="secondary">Same Intent</Badge>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    <Badge variant="outline">
                      {pattern.retryTimeSeconds}s
                    </Badge>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}
