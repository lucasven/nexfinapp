"use client"

import { useState } from 'react'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { findOrCreatePaymentMethod } from '@/lib/actions/payment-methods'
import type { PaymentMethodType } from '@/lib/constants/payment-methods'

interface AddPaymentMethodDialogProps {
  trigger?: React.ReactNode
  onSuccess?: () => void
}

const PAYMENT_METHOD_TYPES: PaymentMethodType[] = ['cash', 'pix', 'other']

export function AddPaymentMethodDialog({ trigger, onSuccess }: AddPaymentMethodDialogProps) {
  const t = useTranslations()
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state
  const [methodName, setMethodName] = useState('')
  const [methodType, setMethodType] = useState<PaymentMethodType>('other')

  // Error state
  const [nameError, setNameError] = useState('')

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
      const result = await findOrCreatePaymentMethod(trimmedName, methodType)

      if (result.success) {
        toast.success(t('paymentMethods.addSuccess'))
        setOpen(false)
        setMethodName('')
        setMethodType('other')
        router.refresh()
        onSuccess?.()
      } else {
        toast.error(result.error || t('paymentMethods.addError'))
      }
    } catch (error) {
      console.error('Error adding payment method:', error)
      toast.error(t('paymentMethods.addError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button>
            {t('paymentMethods.addMethod')}
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WalletIcon className="h-5 w-5" />
            {t('paymentMethods.addMethod')}
          </DialogTitle>
          <DialogDescription>
            {t('paymentMethods.addMethodDescription')}
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
                <SelectValue placeholder={t('paymentMethods.selectType')} />
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
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !methodName.trim()}>
            {isSubmitting ? t('common.saving') : t('common.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
