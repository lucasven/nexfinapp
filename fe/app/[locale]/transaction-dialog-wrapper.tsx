"use client"

import { TransactionDialog } from "@/components/transaction-dialog"
import { useOnboarding } from "@/hooks/use-onboarding"
import type { Category } from "@/lib/types"

interface TransactionDialogWrapperProps {
  categories: Category[]
}

export function TransactionDialogWrapper({ categories }: TransactionDialogWrapperProps) {
  const { currentStep } = useOnboarding()

  return <TransactionDialog categories={categories} currentStep={currentStep} />
}
