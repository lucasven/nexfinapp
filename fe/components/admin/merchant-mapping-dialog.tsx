"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"
import { createMerchantMapping, updateMerchantMapping } from "@/lib/actions/admin"

const merchantMappingSchema = z.object({
  merchantName: z.string().min(1, "Merchant name is required").toUpperCase(),
  categoryId: z.string().min(1, "Category is required"),
  isGlobal: z.boolean().default(false),
  confidence: z.number().min(0).max(1).default(0.90),
})

type MerchantMappingFormValues = z.infer<typeof merchantMappingSchema>

interface Category {
  id: string
  name: string
}

interface MerchantMapping {
  id: string
  merchantName: string
  categoryId: string
  categoryName: string
  confidence: number
  isGlobal: boolean
}

interface MerchantMappingDialogProps {
  categories: Category[]
  mapping?: MerchantMapping // If provided, we're editing
  onSuccess?: () => void
}

export function MerchantMappingDialog({
  categories,
  mapping,
  onSuccess,
}: MerchantMappingDialogProps) {
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isEditing = !!mapping

  const form = useForm<MerchantMappingFormValues>({
    resolver: zodResolver(merchantMappingSchema),
    defaultValues: {
      merchantName: mapping?.merchantName || "",
      categoryId: mapping?.categoryId || "",
      isGlobal: mapping?.isGlobal || false,
      confidence: mapping?.confidence || 0.90,
    },
  })

  const onSubmit = async (values: MerchantMappingFormValues) => {
    setIsSubmitting(true)

    try {
      if (isEditing) {
        await updateMerchantMapping(mapping.id, {
          categoryId: values.categoryId,
          confidence: values.confidence,
          isGlobal: values.isGlobal,
        })
        toast.success("Merchant mapping updated successfully")
      } else {
        await createMerchantMapping(
          values.merchantName,
          values.categoryId,
          values.isGlobal,
          values.confidence
        )
        toast.success("Merchant mapping created successfully")
      }

      setOpen(false)
      form.reset()
      onSuccess?.()
    } catch (error) {
      toast.error(isEditing ? "Failed to update merchant mapping" : "Failed to create merchant mapping")
      console.error(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEditing ? (
          <Button variant="outline" size="sm">
            Edit
          </Button>
        ) : (
          <Button>
            <PlusIcon className="h-4 w-4 mr-2" />
            Add Merchant Mapping
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Merchant Mapping" : "Add Merchant Mapping"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the category or confidence for this merchant"
              : "Map a merchant name to a category for automatic matching"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="merchantName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Merchant Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="IFOOD"
                      {...field}
                      disabled={isEditing} // Can't change merchant name when editing
                      className="uppercase"
                    />
                  </FormControl>
                  <FormDescription>
                    Merchant name as it appears in transactions (uppercase)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confidence"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confidence Score: {field.value.toFixed(2)}</FormLabel>
                  <FormControl>
                    <Slider
                      min={0.5}
                      max={1.0}
                      step={0.05}
                      value={[field.value]}
                      onValueChange={(vals) => field.onChange(vals[0])}
                    />
                  </FormControl>
                  <FormDescription>
                    How confident should this match be? (0.5 - 1.0)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isGlobal"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Global Mapping</FormLabel>
                    <FormDescription>
                      Make this mapping available to all users (not just user-specific)
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : isEditing ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
