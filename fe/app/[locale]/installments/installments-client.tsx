"use client"

import { useState, useTransition } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { format } from "date-fns"
import { ptBR, enUS } from "date-fns/locale"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getInstallmentDetails } from "@/lib/actions/installments"
import { PayoffConfirmationDialog } from "@/components/installments/payoff-confirmation-dialog"
import { EditInstallmentDialog } from "@/components/installments/edit-installment-dialog"
import { DeleteInstallmentDialog } from "@/components/installments/delete-installment-dialog"
import { TransactionDialog } from "@/components/transaction-dialog"
import { trackEvent } from "@/lib/analytics/tracker"
import { AnalyticsEvent } from "@/lib/analytics/events"
import type {
  InstallmentPlanWithDetails,
  InstallmentCounts,
  InstallmentPlanDetails,
  Category,
  PaymentMethod
} from "@/lib/types"

interface InstallmentsClientProps {
  initialInstallments: InstallmentPlanWithDetails[]
  initialTab: 'active' | 'paid_off'
  initialPage: number
  counts: InstallmentCounts
  total: number
  userId: string
  categories: Category[]
  paymentMethods: PaymentMethod[]
}

export default function InstallmentsClient({
  initialInstallments,
  initialTab,
  initialPage,
  counts,
  total,
  userId,
  categories,
  paymentMethods
}: InstallmentsClientProps) {
  const t = useTranslations('installments')
  const tPayoff = useTranslations('installments.payoff')
  const tDelete = useTranslations('installments.delete')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [planDetails, setPlanDetails] = useState<InstallmentPlanDetails | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)
  const [payoffPlanId, setPayoffPlanId] = useState<string | null>(null)
  const [isPayoffDialogOpen, setIsPayoffDialogOpen] = useState(false)
  const [payoffData, setPayoffData] = useState<{ payments: number; amount: number } | null>(null)
  const [editPlanId, setEditPlanId] = useState<string | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [deletePlanId, setDeletePlanId] = useState<string | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const locale = tCommon('locale') as string
  const dateLocale = locale === 'pt-BR' ? ptBR : enUS

  // Handle tab change
  const handleTabChange = (newTab: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('tab', newTab)
    params.set('page', '1') // Reset to page 1 when changing tabs

    // Track analytics
    trackEvent(AnalyticsEvent.INSTALLMENTS_TAB_CHANGED, {
      userId,
      fromTab: initialTab,
      toTab: newTab,
      timestamp: new Date().toISOString()
    })

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  // Handle page change
  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams)
    params.set('page', newPage.toString())

    // Track analytics
    trackEvent(AnalyticsEvent.INSTALLMENTS_PAGE_CHANGED, {
      userId,
      fromPage: initialPage,
      toPage: newPage,
      timestamp: new Date().toISOString()
    })

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  // Handle view details
  const handleViewDetails = async (planId: string) => {
    setSelectedPlanId(planId)
    setIsModalOpen(true)
    setIsLoadingDetails(true)

    try {
      const result = await getInstallmentDetails(planId)
      if (result.success && result.data) {
        setPlanDetails(result.data)
      } else {
        console.error('Failed to fetch installment details:', result.error)
      }
    } catch (error) {
      console.error('Error fetching installment details:', error)
    } finally {
      setIsLoadingDetails(false)
    }
  }

  // Handle pay off
  const handlePayOff = (planId: string) => {
    setPayoffPlanId(planId)
    setIsPayoffDialogOpen(true)
  }

  // Handle payoff success
  const handlePayoffSuccess = () => {
    // Find the installment that was paid off to get the data for toast
    const paidOffInstallment = initialInstallments.find(i => i.id === payoffPlanId)

    if (paidOffInstallment) {
      const paymentsRemaining = paidOffInstallment.total_installments - paidOffInstallment.payments_paid
      const amountRemaining = paidOffInstallment.remaining_amount

      // Store for toast display
      setPayoffData({
        payments: paymentsRemaining,
        amount: amountRemaining
      })

      // Show success toast
      toast.success(tPayoff('successTitle'), {
        description: `${tPayoff(paymentsRemaining === 1 ? 'successDetails_one' : 'successDetails', { count: paymentsRemaining })} ${tPayoff('successAmount', { amount: formatCurrency(amountRemaining) })}`
      })
    }

    // Refresh the page to update the installments list
    router.refresh()
  }

  // Handle edit button click
  const handleEdit = (planId: string) => {
    setEditPlanId(planId)
    setIsEditDialogOpen(true)
  }

  // Handle edit success
  const handleEditSuccess = () => {
    // Show success toast is handled by the EditInstallmentDialog component
    // Just refresh the page to update the installments list
    router.refresh()
  }

  // Handle delete button click
  const handleDelete = (planId: string) => {
    setDeletePlanId(planId)
    setIsDeleteDialogOpen(true)
  }

  // Handle delete success
  const handleDeleteSuccess = () => {
    // Find the installment that was deleted to get the data for toast
    const deletedInstallment = initialInstallments.find(i => i.id === deletePlanId)

    if (deletedInstallment) {
      const pendingCount = deletedInstallment.total_installments - deletedInstallment.payments_paid
      const paidCount = deletedInstallment.payments_paid

      // Show success toast
      toast.success(tDelete('successTitle'), {
        description: `${tDelete('successDescription', { description: deletedInstallment.description })} ${tDelete(pendingCount === 1 ? 'successPendingDeleted_one' : 'successPendingDeleted', { count: pendingCount })}. ${tDelete(paidCount === 1 ? 'successPaidPreserved_one' : 'successPaidPreserved', { count: paidCount })}. ${tDelete('successCommitmentsUpdated')}`
      })
    }

    // Refresh the page to update the installments list
    router.refresh()
  }

  // NOTE: Mark as Paid functionality removed - transactions are created upfront
  // Payment status is automatically determined by statement period

  // Format currency
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'BRL'
    }).format(amount)
  }

  // Format date
  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString)
      return format(date, 'dd/MM/yyyy', { locale: dateLocale })
    } catch {
      return dateString
    }
  }

  // Calculate progress percentage
  const calculateProgress = (paid: number, total: number): number => {
    if (total === 0) return 0
    return Math.round((paid / total) * 100)
  }

  // Get progress bar color
  const getProgressColor = (percentage: number): string => {
    if (percentage < 25) return 'bg-red-500'
    if (percentage < 75) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  // Get status icon
  const getStatusIcon = (status: 'paid' | 'pending' | 'cancelled'): string => {
    switch (status) {
      case 'paid':
        return '✅'
      case 'pending':
        return '📅'
      case 'cancelled':
        return '❌'
    }
  }

  return (
    <>
      <Tabs value={initialTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="active">
            {t('tabs.active')} <Badge variant="secondary" className="ml-2">{counts.active}</Badge>
          </TabsTrigger>
          <TabsTrigger value="paid_off">
            {t('tabs.paidOff')} <Badge variant="secondary" className="ml-2">{counts.paid_off}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={initialTab} className="space-y-6">
          {initialInstallments.length === 0 ? (
            <EmptyState tab={initialTab} t={t} categories={categories} paymentMethods={paymentMethods} />
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {initialInstallments.map((installment) => (
                  <InstallmentCard
                    key={installment.id}
                    installment={installment}
                    onViewDetails={handleViewDetails}
                    onPayOff={handlePayOff}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    formatCurrency={formatCurrency}
                    formatDate={formatDate}
                    calculateProgress={calculateProgress}
                    getProgressColor={getProgressColor}
                    t={t}
                  />
                ))}
              </div>

              <Pagination
                currentPage={initialPage}
                totalItems={total}
                pageSize={20}
                onPageChange={handlePageChange}
                t={t}
              />
            </>
          )}
        </TabsContent>
      </Tabs>

      <InstallmentDetailsModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setSelectedPlanId(null)
          setPlanDetails(null)
        }}
        planDetails={planDetails}
        isLoading={isLoadingDetails}
        formatCurrency={formatCurrency}
        formatDate={formatDate}
        getStatusIcon={getStatusIcon}
        t={t}
      />

      {payoffPlanId && (
        <PayoffConfirmationDialog
          open={isPayoffDialogOpen}
          onOpenChange={setIsPayoffDialogOpen}
          planId={payoffPlanId}
          onSuccess={handlePayoffSuccess}
        />
      )}

      {editPlanId && (
        <EditInstallmentDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          planId={editPlanId}
          onSuccess={handleEditSuccess}
          categories={categories}
        />
      )}

      {deletePlanId && (
        <DeleteInstallmentDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          planId={deletePlanId}
          onSuccess={handleDeleteSuccess}
        />
      )}
    </>
  )
}

// InstallmentCard Component
function InstallmentCard({
  installment,
  onViewDetails,
  onPayOff,
  onEdit,
  onDelete,
  formatCurrency,
  formatDate,
  calculateProgress,
  getProgressColor,
  t
}: {
  installment: InstallmentPlanWithDetails
  onViewDetails: (id: string) => void
  onPayOff: (id: string) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  formatCurrency: (amount: number) => string
  formatDate: (date: string) => string
  calculateProgress: (paid: number, total: number) => number
  getProgressColor: (percentage: number) => string
  t: any
}) {
  const monthlyAmount = installment.total_amount / installment.total_installments
  const progress = calculateProgress(installment.payments_paid, installment.total_installments)
  const progressColor = getProgressColor(progress)

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {installment.category_emoji && <span className="text-2xl">{installment.category_emoji}</span>}
          <span>{installment.description}</span>
        </CardTitle>
        <CardDescription>{installment.payment_method_name}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-medium">
            {t('card.totalAmount', {
              amount: formatCurrency(installment.total_amount),
              count: installment.total_installments,
              monthlyPayment: formatCurrency(monthlyAmount)
            })}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('card.progress', {
              paid: installment.payments_paid,
              total: installment.total_installments
            })}
          </p>
        </div>

        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-right text-muted-foreground">{progress}%</p>
        </div>

        {installment.status === 'active' && (
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {t('card.remaining', { amount: formatCurrency(installment.remaining_amount) })}
            </p>
            {installment.next_payment_date && (
              <p className="text-sm text-muted-foreground">
                {t('card.nextPayment', { date: formatDate(installment.next_payment_date) })}
              </p>
            )}
          </div>
        )}

        {installment.status === 'paid_off' && (
          <p className="text-sm text-muted-foreground">
            {t('card.completedOn', { date: formatDate(installment.updated_at) })}
          </p>
        )}

        {installment.status === 'cancelled' && (
          <p className="text-sm text-muted-foreground">
            {t('card.cancelledOn', { date: formatDate(installment.updated_at) })}
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewDetails(installment.id)}
          >
            {t('actions.viewDetails')}
          </Button>
          {installment.status === 'active' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPayOff(installment.id)}
                disabled={installment.remaining_amount <= 0}
              >
                {t('actions.payOff')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(installment.id)}
              >
                {t('actions.edit')}
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(installment.id)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
          >
            {t('actions.delete')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// EmptyState Component
function EmptyState({
  tab,
  t,
  categories,
  paymentMethods
}: {
  tab: string
  t: any
  categories: Category[]
  paymentMethods: PaymentMethod[]
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="text-6xl">📦</div>
        <h2 className="text-2xl font-bold text-center">
          {t(`emptyState.${tab}`)}
        </h2>
        <p className="text-center text-muted-foreground max-w-md">
          {t(`emptyState.${tab}Description`)}
        </p>
        {tab === 'active' && (
          <TransactionDialog
            categories={categories}
            paymentMethods={paymentMethods}
            trigger={
              <Button variant="default">
                {t('emptyState.createButton')}
              </Button>
            }
          />
        )}
      </CardContent>
    </Card>
  )
}

// Pagination Component
function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  t
}: {
  currentPage: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  t: any
}) {
  const totalPages = Math.ceil(totalItems / pageSize)

  if (totalPages <= 1) return null

  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)

  // Generate page numbers to display (max 5)
  const getPageNumbers = (): number[] => {
    const pages: number[] = []
    const maxVisible = 5

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 5; i++) {
          pages.push(i)
        }
      } else if (currentPage >= totalPages - 2) {
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i)
        }
      } else {
        for (let i = currentPage - 2; i <= currentPage + 2; i++) {
          pages.push(i)
        }
      }
    }

    return pages
  }

  const pageNumbers = getPageNumbers()

  return (
    <div className="flex flex-col items-center gap-4 pt-6">
      <p className="text-sm text-muted-foreground">
        {t('pagination.showing', {
          start: startItem,
          end: endItem,
          total: totalItems
        })}
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          {t('pagination.previous')}
        </Button>

        {pageNumbers.map((pageNum) => (
          <Button
            key={pageNum}
            variant={pageNum === currentPage ? "default" : "outline"}
            size="sm"
            onClick={() => onPageChange(pageNum)}
          >
            {pageNum}
          </Button>
        ))}

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          {t('pagination.next')}
        </Button>
      </div>
    </div>
  )
}

// InstallmentDetailsModal Component
function InstallmentDetailsModal({
  isOpen,
  onClose,
  planDetails,
  isLoading,
  formatCurrency,
  formatDate,
  getStatusIcon,
  t
}: {
  isOpen: boolean
  onClose: () => void
  planDetails: InstallmentPlanDetails | null
  isLoading: boolean
  formatCurrency: (amount: number) => string
  formatDate: (date: string) => string
  getStatusIcon: (status: 'paid' | 'pending' | 'cancelled') => string
  t: any
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {planDetails?.plan.category_emoji && (
              <span className="text-2xl">{planDetails.plan.category_emoji}</span>
            )}
            {planDetails?.plan.description || t('detailsModal.title')}
          </DialogTitle>
          <DialogDescription>
            {planDetails && `${planDetails.plan.payment_method_name} • ${t('card.totalAmount', {
              amount: formatCurrency(planDetails.plan.total_amount),
              count: planDetails.plan.total_installments,
              monthlyPayment: formatCurrency(planDetails.plan.total_amount / planDetails.plan.total_installments)
            })}`}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">{t('loading')}</div>
          </div>
        ) : planDetails ? (
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold mb-4">{t('detailsModal.paymentSchedule')}</h3>
              <div className="space-y-2">
                {planDetails.payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-start justify-between py-2 px-3 rounded-md bg-muted/50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span>{getStatusIcon(payment.status)}</span>
                        <span className="font-medium">
                          {payment.installment_number}/{planDetails.plan.total_installments}
                        </span>
                        <span>-</span>
                        <span>{formatCurrency(payment.amount)}</span>
                        <span>-</span>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(payment.due_date)}
                        </span>
                        <span>-</span>
                        <Badge variant={payment.status === 'paid' ? 'default' : 'secondary'}>
                          {t(`detailsModal.status${payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}`)}
                        </Badge>
                      </div>
                      {payment.transaction_id && payment.transaction_date && (
                        <div className="text-xs text-muted-foreground ml-6 mt-1">
                          {t('detailsModal.transaction', {
                            id: payment.transaction_id.substring(0, 8),
                            date: formatDate(payment.transaction_date)
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t pt-4 space-y-2">
              <p className="font-semibold">
                {planDetails.payments_paid_count === 1
                  ? t('detailsModal.totalPaid_one', {
                      amount: formatCurrency(planDetails.total_paid),
                      count: planDetails.payments_paid_count
                    })
                  : t('detailsModal.totalPaid', {
                      amount: formatCurrency(planDetails.total_paid),
                      count: planDetails.payments_paid_count
                    })}
              </p>
              <p className="font-semibold">
                {planDetails.payments_pending_count === 1
                  ? t('detailsModal.totalRemaining_one', {
                      amount: formatCurrency(planDetails.total_remaining),
                      count: planDetails.payments_pending_count
                    })
                  : t('detailsModal.totalRemaining', {
                      amount: formatCurrency(planDetails.total_remaining),
                      count: planDetails.payments_pending_count
                    })}
              </p>
            </div>

            <div className="flex justify-end">
              <Button onClick={onClose}>{t('detailsModal.close')}</Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">{t('error')}</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
