"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { trackServerEvent } from "@/lib/analytics/server-tracker"
import { AnalyticsEvent } from "@/lib/analytics/events"
import { getStatementPeriodForDate } from "@/lib/utils/statement-period"
import type { CreateInstallmentRequest, CreateInstallmentResponse } from "@/lib/types"

/**
 * Story 2.2: Create Installment Plan (Web Frontend)
 *
 * Creates an installment plan with N monthly payments atomically using PostgreSQL RPC function.
 * This function reuses the same backend logic as Story 2.1 (WhatsApp) for consistency.
 *
 * @param data - Installment creation request data
 * @returns Success/error response with plan ID
 */
export async function createInstallment(
  data: CreateInstallmentRequest
): Promise<CreateInstallmentResponse> {
  const supabase = await getSupabaseServerClient()

  try {
    // Get authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return {
        success: false,
        error: "Not authenticated"
      }
    }

    // Validate payment_method_id is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(data.payment_method_id)) {
      return {
        success: false,
        error: "Invalid payment method ID format"
      }
    }

    // Verify payment method exists and belongs to authenticated user
    const { data: paymentMethod, error: pmError } = await supabase
      .from("payment_methods")
      .select("id, name, type, credit_mode")
      .eq("id", data.payment_method_id)
      .eq("user_id", user.id)
      .single()

    if (pmError || !paymentMethod) {
      return {
        success: false,
        error: "Payment method not found or unauthorized"
      }
    }

    // Verify payment method is Credit Mode
    if (paymentMethod.type !== 'credit' || paymentMethod.credit_mode !== true) {
      return {
        success: false,
        error: "Payment method must be Credit Mode credit card"
      }
    }

    // Validate inputs
    if (data.total_amount <= 0) {
      return {
        success: false,
        error: "Amount must be greater than zero"
      }
    }

    if (data.total_installments < 1 || data.total_installments > 60) {
      return {
        success: false,
        error: "Installments must be between 1 and 60"
      }
    }

    // Call PostgreSQL RPC function to create installment plan atomically
    // This function creates 1 installment_plan + N installment_payments in a single transaction
    const { data: rpcData, error: rpcError } = await supabase.rpc('create_installment_plan_atomic', {
      p_user_id: user.id,
      p_payment_method_id: data.payment_method_id,
      p_description: data.description,
      p_total_amount: data.total_amount,
      p_total_installments: data.total_installments,
      p_merchant: data.merchant || null,
      p_category_id: data.category_id || null,
      p_first_payment_date: data.first_payment_date
    })

    if (rpcError) {
      console.error('RPC error creating installment plan:', rpcError)
      return {
        success: false,
        error: rpcError.message || "Failed to create installment plan"
      }
    }

    // RPC returns array with single object: { plan_id, success, error_message }
    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData

    if (!result || !result.success) {
      return {
        success: false,
        error: result?.error_message || "Failed to create installment plan"
      }
    }

    const planId = result.plan_id
    const monthlyAmount = Math.round((data.total_amount / data.total_installments) * 100) / 100

    // Fetch all installment payments created by the RPC
    const { data: payments, error: paymentsError } = await supabase
      .from('installment_payments')
      .select('*')
      .eq('plan_id', planId)
      .order('installment_number', { ascending: true })

    if (paymentsError || !payments || payments.length === 0) {
      console.error('Error fetching installment payments:', paymentsError)
      return {
        success: false,
        error: "Failed to fetch installment payments"
      }
    }

    // Get payment method details for statement period calculation
    const { data: paymentMethodDetails, error: pmDetailsError } = await supabase
      .from("payment_methods")
      .select("statement_closing_day, payment_due_day, days_before_closing")
      .eq("id", data.payment_method_id)
      .single()

    if (pmDetailsError) {
      console.error('Error fetching payment method details:', pmDetailsError)
      return {
        success: false,
        error: "Failed to fetch payment method details"
      }
    }

    // Create transactions for each installment payment
    let transactionsCreated = 0
    let transactionsFailed = 0

    for (const payment of payments) {
      try {
        // Generate description with installment number
        const description = `${data.description} (${payment.installment_number}/${data.total_installments})`

        // Generate user-readable ID using the database function
        const { data: readableIdData, error: idError } = await supabase.rpc("generate_transaction_id")

        if (idError) {
          console.error(`Error generating transaction ID for installment ${payment.installment_number}:`, idError)
          transactionsFailed++

          await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_TRANSACTION_CREATION_FAILED, {
            userId: user.id,
            planId: planId,
            installmentNumber: payment.installment_number,
            error: idError.message
          })
          continue
        }

        // Create transaction
        const { data: transaction, error: txError } = await supabase
          .from('transactions')
          .insert({
            user_id: user.id,
            amount: payment.amount,
            type: 'expense',
            category_id: data.category_id || null,
            description: description,
            date: payment.due_date,
            payment_method_id: data.payment_method_id,
            user_readable_id: readableIdData,
            metadata: {
              installment_source: true,
              installment_plan_id: planId,
              installment_number: payment.installment_number,
              total_installments: data.total_installments
            }
          })
          .select()
          .single()

        if (txError || !transaction) {
          console.error(`Error creating transaction for installment ${payment.installment_number}:`, txError)
          transactionsFailed++

          await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_TRANSACTION_CREATION_FAILED, {
            userId: user.id,
            planId: planId,
            installmentNumber: payment.installment_number,
            error: txError?.message || 'Unknown error'
          })
          continue
        }

        // Determine if this payment is in current/past period
        let isPastOrCurrent = false
        const effectiveClosingDay = paymentMethodDetails.days_before_closing != null && paymentMethodDetails.payment_due_day != null
          ? (() => {
              const d = new Date()
              d.setDate(paymentMethodDetails.payment_due_day! - paymentMethodDetails.days_before_closing!)
              return d.getDate()
            })()
          : paymentMethodDetails.statement_closing_day
        if (effectiveClosingDay != null) {
          const paymentDate = new Date(payment.due_date)
          const periodInfo = getStatementPeriodForDate(
            effectiveClosingDay,
            paymentDate,
            new Date()
          )
          isPastOrCurrent = periodInfo.period === 'past' || periodInfo.period === 'current'
        }

        // Link transaction to payment and update status
        const { error: updateError } = await supabase
          .from('installment_payments')
          .update({
            transaction_id: transaction.id,
            status: isPastOrCurrent ? 'paid' : 'pending'
          })
          .eq('id', payment.id)

        if (updateError) {
          console.error(`Error linking transaction to payment ${payment.installment_number}:`, updateError)
          transactionsFailed++

          await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_TRANSACTION_CREATION_FAILED, {
            userId: user.id,
            planId: planId,
            installmentNumber: payment.installment_number,
            error: updateError.message
          })
          continue
        }

        transactionsCreated++

        // Track analytics for each successful transaction creation
        await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_TRANSACTION_CREATED, {
          userId: user.id,
          planId: planId,
          transactionId: transaction.id,
          installmentNumber: payment.installment_number,
          totalInstallments: data.total_installments,
          amount: payment.amount,
          status: isPastOrCurrent ? 'paid' : 'pending',
          channel: 'web'
        })

      } catch (error) {
        console.error(`Unexpected error creating transaction for installment ${payment.installment_number}:`, error)
        transactionsFailed++

        await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_TRANSACTION_CREATION_FAILED, {
          userId: user.id,
          planId: planId,
          installmentNumber: payment.installment_number,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    // Track overall completion event
    await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_ALL_TRANSACTIONS_CREATED, {
      userId: user.id,
      planId: planId,
      totalInstallments: data.total_installments,
      transactionsCreated: transactionsCreated,
      transactionsFailed: transactionsFailed,
      channel: 'web'
    })

    // Track success analytics event for installment plan creation
    await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_CREATED, {
      userId: user.id,
      planId: planId,
      paymentMethodId: data.payment_method_id,
      totalAmount: data.total_amount,
      totalInstallments: data.total_installments,
      monthlyAmount: monthlyAmount,
      hasDescription: !!data.description,
      hasMerchant: !!data.merchant,
      hasCategory: !!data.category_id,
      channel: 'web',
      timestamp: new Date().toISOString()
    })

    // Revalidate paths to refresh data
    revalidatePath("/")
    revalidatePath("/[locale]/installments")
    revalidatePath("/[locale]")

    return {
      success: true,
      planId: planId
    }

  } catch (error) {
    console.error('Unexpected error creating installment:', error)

    // Track failure analytics event
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        await trackServerEvent(user.id, AnalyticsEvent.INSTALLMENT_CREATION_FAILED, {
          userId: user.id,
          error: error instanceof Error ? error.message : 'Unknown error',
          totalAmount: data.total_amount || null,
          totalInstallments: data.total_installments || null,
          channel: 'web'
        })
      }
    } catch (trackError) {
      console.error('Failed to track error event:', trackError)
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error creating installment"
    }
  }
}
