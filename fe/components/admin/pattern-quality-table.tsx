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

interface PatternData {
  patternType: string
  usageCount: number
  successCount: number
  failureCount: number
  accuracy: number
  confidence: number
  lastUsed: string
}

interface PatternQualityTableProps {
  patterns: PatternData[]
}

const PATTERN_TYPE_LABELS: Record<string, string> = {
  expense: "Expense",
  budget: "Budget",
  recurring: "Recurring",
  report: "Report",
}

export function PatternQualityTable({ patterns }: PatternQualityTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pattern Type</TableHead>
            <TableHead className="text-right">Usage</TableHead>
            <TableHead className="text-right">Success</TableHead>
            <TableHead className="text-right">Failure</TableHead>
            <TableHead className="text-right">Accuracy</TableHead>
            <TableHead className="text-right">Confidence</TableHead>
            <TableHead>Last Used</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {patterns.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                No learned patterns yet
              </TableCell>
            </TableRow>
          ) : (
            patterns.map((pattern, index) => (
              <TableRow key={index}>
                <TableCell className="font-medium">
                  {PATTERN_TYPE_LABELS[pattern.patternType] || pattern.patternType}
                </TableCell>
                <TableCell className="text-right">{pattern.usageCount}</TableCell>
                <TableCell className="text-right text-green-600">{pattern.successCount}</TableCell>
                <TableCell className="text-right text-red-600">{pattern.failureCount}</TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant={pattern.accuracy >= 80 ? "default" : pattern.accuracy >= 60 ? "secondary" : "destructive"}
                  >
                    {pattern.accuracy.toFixed(1)}%
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="outline">{pattern.confidence.toFixed(1)}%</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {pattern.lastUsed ? new Date(pattern.lastUsed).toLocaleDateString() : "Never"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
