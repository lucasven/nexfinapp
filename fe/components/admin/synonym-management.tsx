"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { SearchIcon, TrashIcon } from "lucide-react"
import { toast } from "sonner"
import { deleteCategorySynonym } from "@/lib/actions/admin"
import { SynonymDialog } from "./synonym-dialog"

interface Synonym {
  id: string
  categoryId: string
  categoryName: string
  synonym: string
  language: string
  isMerchant: boolean
  confidence: number
  createdAt: string
}

interface Category {
  id: string
  name: string
}

interface SynonymManagementProps {
  synonyms: Synonym[]
  categories: Category[]
}

export function SynonymManagement({ synonyms, categories }: SynonymManagementProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Group synonyms by category
  const groupedSynonyms = synonyms.reduce((acc, synonym) => {
    if (!acc[synonym.categoryId]) {
      acc[synonym.categoryId] = {
        categoryName: synonym.categoryName,
        synonyms: [],
      }
    }
    acc[synonym.categoryId].synonyms.push(synonym)
    return acc
  }, {} as Record<string, { categoryName: string; synonyms: Synonym[] }>)

  // Filter based on search
  const filteredGroups = Object.entries(groupedSynonyms).filter(
    ([_, data]) =>
      data.categoryName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      data.synonyms.some((s) => s.synonym.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const handleDelete = async (id: string, synonym: string) => {
    setDeletingId(id)

    try {
      await deleteCategorySynonym(id)
      toast.success(`Synonym "${synonym}" deleted successfully`)
    } catch (error) {
      toast.error("Failed to delete synonym")
      console.error(error)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search categories or synonyms..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <SynonymDialog categories={categories} />
      </div>

      {filteredGroups.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">
            {searchTerm ? "No synonyms found" : "No synonyms yet"}
          </p>
        </div>
      ) : (
        <Accordion type="multiple" className="w-full">
          {filteredGroups.map(([categoryId, data]) => (
            <AccordionItem key={categoryId} value={categoryId}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4">
                  <span className="font-medium">{data.categoryName}</span>
                  <span className="text-sm text-muted-foreground">
                    {data.synonyms.length} synonym{data.synonyms.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pt-2">
                  <div className="flex justify-end mb-2">
                    <SynonymDialog categories={categories} defaultCategoryId={categoryId} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {data.synonyms.map((synonym) => (
                      <div
                        key={synonym.id}
                        className="group flex items-center justify-between rounded-lg border bg-card p-3 hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{synonym.synonym}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">
                              {synonym.language}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              •
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {(synonym.confidence * 100).toFixed(0)}% confidence
                            </span>
                          </div>
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={deletingId === synonym.id}
                              className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Synonym?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete the synonym{" "}
                                <strong>"{synonym.synonym}"</strong>? This action cannot be
                                undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(synonym.id, synonym.synonym)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ))}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  )
}
