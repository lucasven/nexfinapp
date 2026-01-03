'use client'

import { useTranslations } from 'next-intl'
import type { StatementPeriodType } from '@/lib/utils/statement-period'

interface StatementBadgeProps {
  period: StatementPeriodType
  compact?: boolean
  className?: string
}

/**
 * Statement Period Badge Component
 *
 * Displays a badge indicating which statement period a transaction belongs to:
 * - Current: Blue badge (informational, neutral)
 * - Next: Gray badge (neutral, forward-looking)
 * - Past: Light gray badge (de-emphasized, historical)
 *
 * Design: Follows awareness-first principles with neutral colors and non-judgmental language
 *
 * @param period - The statement period type: 'current', 'next', or 'past'
 * @param compact - Whether to show abbreviated labels (for mobile)
 * @param className - Additional CSS classes to apply
 */
export function StatementBadge({
  period,
  compact = false,
  className = '',
}: StatementBadgeProps) {
  const t = useTranslations('statementPeriod')

  // Get the appropriate label based on compact mode
  const label = compact
    ? t(`${period}BadgeShort` as 'currentBadgeShort' | 'nextBadgeShort' | 'pastBadgeShort')
    : t(`${period}Badge` as 'currentBadge' | 'nextBadge' | 'pastBadge')

  // Get the full label for aria-label (accessibility)
  const fullLabel = t(`${period}Badge` as 'currentBadge' | 'nextBadge' | 'pastBadge')

  // Badge styling based on period type (awareness-first: neutral colors only)
  const badgeStyles = {
    current: 'bg-blue-500 text-white',     // Blue: Informational, neutral
    next: 'bg-gray-500 text-white',        // Gray: Neutral, forward-looking
    past: 'bg-gray-300 text-gray-600',     // Light gray: De-emphasized, historical
  }

  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${badgeStyles[period]} ${className}`}
      aria-label={fullLabel}
      role="status"
    >
      {label}
    </span>
  )
}
