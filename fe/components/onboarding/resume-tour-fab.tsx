"use client"

import { Button } from "@/components/ui/button"
import { GraduationCap } from "lucide-react"
import { trackEvent } from "@/lib/analytics/tracker"
import { AnalyticsEvent } from "@/lib/analytics/events"

interface ResumeTourFABProps {
  onClick: () => void
}

export function ResumeTourFAB({ onClick }: ResumeTourFABProps) {
  const handleClick = () => {
    trackEvent(AnalyticsEvent.ONBOARDING_TOUR_RESUMED)
    onClick()
  }

  return (
    <div className="fixed bottom-6 right-6 z-[9997]">
      <Button
        onClick={handleClick}
        size="lg"
        className="rounded-full shadow-lg h-14 px-6"
      >
        <GraduationCap className="mr-2 h-5 w-5" />
        Continue Tour
      </Button>
    </div>
  )
}
