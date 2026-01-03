"use client"

import { TransactionDialog } from "@/components/transaction-dialog"
import { useOnboarding } from "@/hooks/use-onboarding"
import type { Category, PaymentMethod } from "@/lib/types"

interface TransactionDialogWrapperProps {
  categories: Category[]
  paymentMethods: PaymentMethod[]
}

export function TransactionDialogWrapper({ categories, paymentMethods }: TransactionDialogWrapperProps) {
  const { currentStep } = useOnboarding()

  return <TransactionDialog categories={categories} paymentMethods={paymentMethods} currentStep={currentStep} />
}
