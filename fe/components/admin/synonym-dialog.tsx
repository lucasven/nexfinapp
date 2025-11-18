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
import { Slider } from "@/components/ui/slider"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"
import { createCategorySynonym } from "@/lib/actions/admin"

const synonymSchema = z.object({
  categoryId: z.string().min(1, "Category is required"),
  synonym: z.string().min(1, "Synonym is required"),
  language: z.enum(["pt-BR", "en"]).default("pt-BR"),
  confidence: z.number().min(0.5).max(1).default(0.80),
})

type SynonymFormValues = z.infer<typeof synonymSchema>

interface Category {
  id: string
  name: string
}

interface SynonymDialogProps {
  categories: Category[]
  defaultCategoryId?: string // Pre-select category
  onSuccess?: () => void
}

export function SynonymDialog({
  categories,
  defaultCategoryId,
  onSuccess,
}: SynonymDialogProps) {
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<SynonymFormValues>({
    resolver: zodResolver(synonymSchema),
    defaultValues: {
      categoryId: defaultCategoryId || "",
      synonym: "",
      language: "pt-BR",
      confidence: 0.80,
    },
  })

  const onSubmit = async (values: SynonymFormValues) => {
    setIsSubmitting(true)

    try {
      await createCategorySynonym(
        values.categoryId,
        values.synonym,
        values.language,
        false, // isMerchant
        values.confidence
      )

      toast.success("Synonym added successfully")
      setOpen(false)
      form.reset()
      onSuccess?.()
    } catch (error) {
      toast.error("Failed to add synonym")
      console.error(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <PlusIcon className="h-4 w-4 mr-1" />
          Add Synonym
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Add Category Synonym</DialogTitle>
          <DialogDescription>
            Add alternative keywords or names that should match this category
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
              name="synonym"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Synonym / Keyword</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="comida, mercado, etc."
                      {...field}
                      onChange={(e) => field.onChange(e.target.value.toLowerCase())}
                    />
                  </FormControl>
                  <FormDescription>
                    Alternative name or keyword (will be stored in lowercase)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="language"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Language</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="pt-BR">Portuguese (pt-BR)</SelectItem>
                      <SelectItem value="en">English (en)</SelectItem>
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
                  <FormLabel>Match Confidence: {field.value.toFixed(2)}</FormLabel>
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
                {isSubmitting ? "Adding..." : "Add Synonym"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
