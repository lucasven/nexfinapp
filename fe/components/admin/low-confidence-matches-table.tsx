"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CheckIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { approveCategoryMatch, rejectCategoryMatch } from "@/lib/actions/admin"

interface LowConfidenceMatch {
  id: string
  description: string
  amount: number
  category: string
  categoryId: string
  userId: string
  createdAt: string
  needsReview: boolean
  confidence: number
}

interface Category {
  id: string
  name: string
}

interface LowConfidenceMatchesTableProps {
  matches: LowConfidenceMatch[]
  categories: Category[]
}

export function LowConfidenceMatchesTable({ matches, categories }: LowConfidenceMatchesTableProps) {
  const [selectedCategories, setSelectedCategories] = useState<Record<string, string>>({})
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())

  const handleApprove = async (match: LowConfidenceMatch) => {
    setProcessingIds((prev) => new Set(prev).add(match.id))

    try {
      await approveCategoryMatch(
        match.id,
        match.categoryId,
        match.description,
        match.userId
      )

      toast.success("Match approved and added to user preferences")
      setHiddenIds((prev) => new Set(prev).add(match.id))
    } catch (error) {
      toast.error("Failed to approve match")
      console.error(error)
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev)
        next.delete(match.id)
        return next
      })
    }
  }

  const handleReject = async (match: LowConfidenceMatch) => {
    const newCategoryId = selectedCategories[match.id]

    if (!newCategoryId) {
      toast.error("Please select a category first")
      return
    }

    setProcessingIds((prev) => new Set(prev).add(match.id))

    try {
      await rejectCategoryMatch(match.id, newCategoryId, match.userId)

      toast.success("Category corrected successfully")
      setHiddenIds((prev) => new Set(prev).add(match.id))
    } catch (error) {
      toast.error("Failed to correct category")
      console.error(error)
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev)
        next.delete(match.id)
        return next
      })
    }
  }

  const visibleMatches = matches.filter(
    (m) => m.needsReview && !hiddenIds.has(m.id)
  )

  if (visibleMatches.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">
          No low-confidence matches requiring review
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Current Category</TableHead>
            <TableHead>Confidence</TableHead>
            <TableHead>Correct Category</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleMatches.map((match) => {
            const isProcessing = processingIds.has(match.id)

            return (
              <TableRow key={match.id}>
                <TableCell className="font-medium">{match.description}</TableCell>
                <TableCell>R$ {match.amount.toFixed(2)}</TableCell>
                <TableCell>{match.category}</TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                      match.confidence >= 0.7
                        ? "bg-yellow-50 text-yellow-700"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    {(match.confidence * 100).toFixed(0)}%
                  </span>
                </TableCell>
                <TableCell>
                  <Select
                    value={selectedCategories[match.id] || ""}
                    onValueChange={(value) =>
                      setSelectedCategories((prev) => ({
                        ...prev,
                        [match.id]: value,
                      }))
                    }
                    disabled={isProcessing}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleApprove(match)}
                    disabled={isProcessing}
                    className="text-green-600 hover:text-green-700 hover:bg-green-50"
                  >
                    <CheckIcon className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleReject(match)}
                    disabled={isProcessing || !selectedCategories[match.id]}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <XIcon className="h-4 w-4 mr-1" />
                    Correct
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
