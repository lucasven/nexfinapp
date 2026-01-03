/**
 * Collapsible Category Breakdown Wrapper
 *
 * Server component that fetches budget data and renders the collapsible category breakdown
 */

import { getBudgetForPeriod } from '@/lib/actions/budget'
import { getStatementPeriod, formatStatementPeriod } from '@/lib/utils/statement-period'
import { getLocale } from 'next-intl/server'
import { CollapsibleCategoryBreakdown } from './collapsible-category-breakdown'

interface CollapsibleCategoryBreakdownWrapperProps {
  paymentMethodId: string
}

export async function CollapsibleCategoryBreakdownWrapper({
  paymentMethodId
}: CollapsibleCategoryBreakdownWrapperProps) {
  const locale = await getLocale()

  // Calculate current statement period
  const period = getStatementPeriod(new Date(), 5) // TODO Epic 3: Read closing day from payment method

  // Fetch budget data
  const result = await getBudgetForPeriod(
    paymentMethodId,
    period.periodStart,
    period.periodEnd
  )

  if (!result.success || !result.data || result.data.categories.length === 0) {
    return null
  }

  const { totalSpent, categories } = result.data

  // Format statement period
  const periodString = formatStatementPeriod(period, locale)

  return (
    <CollapsibleCategoryBreakdown
      categories={categories}
      periodString={periodString}
      totalSpent={totalSpent}
    />
  )
}
