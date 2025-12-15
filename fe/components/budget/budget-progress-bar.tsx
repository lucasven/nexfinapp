/**
 * Budget Progress Bar Component
 * Story 3.3: Budget Progress Dashboard Statement Period
 *
 * Visual progress bar showing budget usage with awareness-first colors.
 * Color changes based on status (on-track, near-limit, exceeded).
 * Smooth CSS transitions for better UX.
 */

'use client'

import type { BudgetStatus } from '@/lib/supabase/rpc-types'
import { cn } from '@/lib/utils'

interface BudgetProgressBarProps {
  percentage: number
  status: BudgetStatus
  className?: string
}

/**
 * Get color classes based on budget status
 * Awareness-first design: Blue, Yellow/Amber, Gray (NO RED)
 */
function getStatusColors(status: BudgetStatus): {
  bar: string
  background: string
} {
  switch (status) {
    case 'on-track':
      // Blue - neutral positive
      return {
        bar: 'bg-blue-500',
        background: 'bg-blue-100'
      }
    case 'near-limit':
      // Yellow/Amber - caution, not alarm
      return {
        bar: 'bg-amber-500',
        background: 'bg-amber-100'
      }
    case 'exceeded':
      // Gray - awareness-first, NOT red
      return {
        bar: 'bg-gray-500',
        background: 'bg-gray-100'
      }
    default:
      return {
        bar: 'bg-blue-500',
        background: 'bg-blue-100'
      }
  }
}

export function BudgetProgressBar({
  percentage,
  status,
  className
}: BudgetProgressBarProps) {
  // Cap percentage at 100% for visual display (even if exceeded)
  const displayPercentage = Math.min(percentage, 100)

  const colors = getStatusColors(status)

  return (
    <div
      className={cn('w-full', className)}
      role="progressbar"
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Budget ${percentage.toFixed(1)}% used`}
    >
      {/* Progress bar background */}
      <div className={cn('h-2 rounded-full overflow-hidden', colors.background)}>
        {/* Progress bar fill */}
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300 ease-in-out',
            colors.bar
          )}
          style={{ width: `${displayPercentage}%` }}
        />
      </div>
    </div>
  )
}
