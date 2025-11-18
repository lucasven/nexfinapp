"use client"

import { useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { deleteMerchantMapping } from "@/lib/actions/admin"
import { MerchantMappingDialog } from "./merchant-mapping-dialog"

interface MerchantMapping {
  id: string
  merchantName: string
  categoryId: string
  categoryName: string
  confidence: number
  usageCount: number
  isGlobal: boolean
  userId: string | null
  createdAt: string
}

interface Category {
  id: string
  name: string
}

interface MerchantMappingTableProps {
  mappings: MerchantMapping[]
  categories: Category[]
}

export function MerchantMappingTable({ mappings, categories }: MerchantMappingTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const filteredMappings = mappings.filter(
    (m) =>
      m.merchantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.categoryName.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleDelete = async (id: string) => {
    setDeletingId(id)

    try {
      await deleteMerchantMapping(id)
      toast.success("Merchant mapping deleted successfully")
      // The page will revalidate automatically due to revalidatePath in the server action
    } catch (error) {
      toast.error("Failed to delete merchant mapping")
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
            placeholder="Search merchants or categories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <MerchantMappingDialog categories={categories} />
      </div>

      {filteredMappings.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">
            {searchTerm ? "No merchants found" : "No merchant mappings yet"}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Merchant</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMappings.map((mapping) => (
                <TableRow key={mapping.id}>
                  <TableCell className="font-medium">{mapping.merchantName}</TableCell>
                  <TableCell>{mapping.categoryName}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                      {(mapping.confidence * 100).toFixed(0)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {mapping.usageCount} uses
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-1 text-xs ${
                        mapping.isGlobal
                          ? "bg-blue-50 text-blue-700"
                          : "bg-gray-50 text-gray-700"
                      }`}
                    >
                      {mapping.isGlobal ? "Global" : "User"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <MerchantMappingDialog
                      categories={categories}
                      mapping={mapping}
                    />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={deletingId === mapping.id}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Merchant Mapping?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete the mapping for{" "}
                            <strong>{mapping.merchantName}</strong>? This action cannot be
                            undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(mapping.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
