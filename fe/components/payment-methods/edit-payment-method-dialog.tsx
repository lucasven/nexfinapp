"use client"

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { WalletIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PaymentMethod } from '@/lib/types'
import type { PaymentMethodType } from '@/lib/constants/payment-methods'
import { updatePaymentMethod } from '@/lib/actions/payment-methods'

interface EditPaymentMethodDialogProps {
  method: PaymentMethod
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

const PAYMENT_METHOD_TYPES: PaymentMethodType[] = ['cash', 'pix', 'other']

export function EditPaymentMethodDialog({ method, open, onOpenChange, onSuccess }: EditPaymentMethodDialogProps) {
  const t = useTranslations()
  const router = useRouter()

  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state
  const [methodName, setMethodName] = useState(method.name)
  const [methodType, setMethodType] = useState<PaymentMethodType>(method.type as PaymentMethodType)

  // Error state
  const [nameError, setNameError] = useState('')

  // Reset form when dialog opens with new method
  useEffect(() => {
    if (open) {
      setMethodName(method.name)
      setMethodType(method.type as PaymentMethodType)
      setNameError('')
    }
  }, [open, method])

  const handleSubmit = async () => {
    // Validate method name
    const trimmedName = methodName.trim()
    if (!trimmedName) {
      setNameError(t('paymentMethods.methodNameRequired'))
      return
    }
    setNameError('')

    setIsSubmitting(true)
    try {
      const result = await updatePaymentMethod(method.id, {
        name: trimmedName,
        type: methodType,
      })

      if (!result.success) {
        toast.error(result.error || t('paymentMethods.editError'))
        return
      }

      toast.success(t('paymentMethods.editSuccess'))
      onOpenChange(false)
      onSuccess?.()
      router.refresh()
    } catch (error) {
      console.error('Error updating payment method:', error)
      toast.error(t('paymentMethods.editError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WalletIcon className="h-5 w-5" />
            {t('paymentMethods.editMethod')}
          </DialogTitle>
          <DialogDescription>
            {t('paymentMethods.editMethodDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Method Name */}
          <div className="space-y-2">
            <Label htmlFor="method-name">{t('paymentMethods.methodName')}</Label>
            <Input
              id="method-name"
              value={methodName}
              onChange={(e) => {
                setMethodName(e.target.value)
                setNameError('')
              }}
              placeholder={t('paymentMethods.methodNamePlaceholder')}
              className={nameError ? 'border-destructive' : ''}
            />
            {nameError && (
              <p className="text-sm text-destructive">{nameError}</p>
            )}
          </div>

          {/* Method Type */}
          <div className="space-y-2">
            <Label htmlFor="method-type">{t('paymentMethods.methodType')}</Label>
            <Select
              value={methodType}
              onValueChange={(value) => setMethodType(value as PaymentMethodType)}
            >
              <SelectTrigger id="method-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHOD_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(`paymentMethods.types.${type}` as any)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !methodName.trim()}>
            {isSubmitting ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
