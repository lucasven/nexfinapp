/**
 * React Query hooks for budget progress data
 *
 * Story 3.3: Budget Progress Dashboard Statement Period
 *
 * Provides hooks for fetching and caching budget progress data with:
 * - 5-minute cache for performance
 * - Automatic refetch on window focus
 * - Cache invalidation on transaction mutations
 */

"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getBudgetProgress, getAllBudgetProgress } from "@/lib/actions/budget"
import type { BudgetProgress } from "@/lib/supabase/rpc-types"

/**
 * Query key factory for budget progress queries
 * Ensures consistent keys across the app
 */
export const budgetProgressKeys = {
  all: ['budgetProgress'] as const,
  lists: () => [...budgetProgressKeys.all, 'list'] as const,
  list: (userId: string) => [...budgetProgressKeys.lists(), userId] as const,
  details: () => [...budgetProgressKeys.all, 'detail'] as const,
  detail: (paymentMethodId: string) => [...budgetProgressKeys.details(), paymentMethodId] as const,
}

/**
 * Hook to fetch budget progress for a single payment method
 *
 * Caches data for 5 minutes to reduce server load while maintaining
 * reasonable freshness. Use queryClient.invalidateQueries() to force refresh.
 *
 * @param paymentMethodId - Payment method to get budget progress for
 * @param enabled - Whether to enable the query (default: true)
 * @returns React Query result with budget progress data
 *
 * @example
 * const { data, isLoading, error } = useBudgetProgress('pm-uuid')
 * if (data) {
 *   return <BudgetProgressWidget budgetProgress={data} />
 * }
 */
export function useBudgetProgress(paymentMethodId: string, enabled = true) {
  return useQuery({
    queryKey: budgetProgressKeys.detail(paymentMethodId),
    queryFn: () => getBudgetProgress(paymentMethodId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    refetchOnWindowFocus: true,
    enabled: enabled && !!paymentMethodId,
  })
}

/**
 * Hook to fetch budget progress for all Credit Mode payment methods
 *
 * Returns array sorted by next closing date (soonest first).
 * Only includes cards with credit_mode = true, closing day, and budget set.
 *
 * @param userId - Current user ID (for cache key)
 * @param enabled - Whether to enable the query (default: true)
 * @returns React Query result with array of budget progress data
 *
 * @example
 * const { data: allProgress, isLoading } = useAllBudgetProgress(userId)
 * return (
 *   <div>
 *     {allProgress?.map(progress => (
 *       <BudgetProgressWidget key={progress.paymentMethodId} budgetProgress={progress} />
 *     ))}
 *   </div>
 * )
 */
export function useAllBudgetProgress(userId?: string, enabled = true) {
  return useQuery({
    queryKey: userId ? budgetProgressKeys.list(userId) : budgetProgressKeys.lists(),
    queryFn: getAllBudgetProgress,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: true,
    enabled: enabled,
  })
}

/**
 * Hook to get invalidation functions for budget progress queries
 *
 * Use this in transaction mutation callbacks to invalidate the budget cache
 * and trigger automatic refetch of updated data.
 *
 * @returns Object with invalidation functions
 *
 * @example
 * const { invalidateBudgetProgress, invalidateAllBudgetProgress } = useInvalidateBudgetProgress()
 *
 * // After adding transaction:
 * await addTransaction(data)
 * invalidateBudgetProgress(paymentMethodId) // Invalidate specific card
 * invalidateAllBudgetProgress() // Invalidate all cards
 */
export function useInvalidateBudgetProgress() {
  const queryClient = useQueryClient()

  return {
    /**
     * Invalidate budget progress for a specific payment method
     */
    invalidateBudgetProgress: (paymentMethodId: string) => {
      return queryClient.invalidateQueries({
        queryKey: budgetProgressKeys.detail(paymentMethodId)
      })
    },

    /**
     * Invalidate budget progress for all payment methods
     */
    invalidateAllBudgetProgress: (userId?: string) => {
      if (userId) {
        return queryClient.invalidateQueries({
          queryKey: budgetProgressKeys.list(userId)
        })
      }
      return queryClient.invalidateQueries({
        queryKey: budgetProgressKeys.lists()
      })
    },

    /**
     * Invalidate all budget progress queries (both specific and lists)
     */
    invalidateAll: () => {
      return queryClient.invalidateQueries({
        queryKey: budgetProgressKeys.all
      })
    }
  }
}

/**
 * Hook to optimistically update budget progress after mutation
 *
 * Updates the UI immediately with predicted values, then refetches
 * to ensure accuracy. Rolls back if the mutation fails.
 *
 * @returns Object with optimistic update functions
 *
 * @example
 * const { optimisticallyUpdateBudget } = useOptimisticBudgetUpdate()
 *
 * // When adding expense:
 * optimisticallyUpdateBudget(paymentMethodId, expenseAmount)
 * await addTransaction(data)
 */
export function useOptimisticBudgetUpdate() {
  const queryClient = useQueryClient()

  return {
    /**
     * Optimistically update budget progress by adding to spent amount
     *
     * @param paymentMethodId - Payment method to update
     * @param additionalSpent - Amount to add to spent (positive for expense, negative for refund)
     */
    optimisticallyUpdateBudget: (paymentMethodId: string, additionalSpent: number) => {
      queryClient.setQueryData<BudgetProgress | null>(
        budgetProgressKeys.detail(paymentMethodId),
        (old) => {
          if (!old) return old

          const newSpent = old.spentAmount + additionalSpent
          const newRemaining = old.monthlyBudget - newSpent
          const newPercentage = old.monthlyBudget > 0
            ? Math.round((newSpent / old.monthlyBudget) * 10000) / 100
            : 0

          // Determine new status
          let newStatus: BudgetProgress['status'] = 'on-track'
          if (newPercentage >= 100) {
            newStatus = 'exceeded'
          } else if (newPercentage >= 80) {
            newStatus = 'near-limit'
          }

          return {
            ...old,
            spentAmount: newSpent,
            remainingAmount: newRemaining,
            percentageUsed: newPercentage,
            status: newStatus,
          }
        }
      )
    },

    /**
     * Rollback optimistic update (used if mutation fails)
     */
    rollback: (paymentMethodId: string) => {
      return queryClient.invalidateQueries({
        queryKey: budgetProgressKeys.detail(paymentMethodId)
      })
    }
  }
}
