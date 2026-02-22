import { getMySubscription, getLifetimeSpotsRemaining } from "@/lib/actions/subscriptions"
import { PricingClient } from "./pricing-client"

export default async function PricingPage() {
  const [{ tier, subscription }, spotsRemaining] = await Promise.all([
    getMySubscription(),
    getLifetimeSpotsRemaining(),
  ])

  return (
    <PricingClient
      currentTier={tier}
      subscription={subscription}
      lifetimeSpotsRemaining={spotsRemaining}
    />
  )
}
