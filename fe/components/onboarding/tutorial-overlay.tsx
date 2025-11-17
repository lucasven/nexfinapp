"use client"

import { useEffect } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { trackEvent } from "@/lib/analytics/tracker"
import { AnalyticsEvent, AnalyticsProperty } from "@/lib/analytics/events"
import { useTranslations } from 'next-intl'

interface TutorialOverlayProps {
  isOpen: boolean
  onClose: () => void
  onNext?: () => void
  onSkip?: () => void
  targetSelector?: string // CSS selector for element to highlight
  title: string
  description: string
  step?: number
  totalSteps?: number
  showNext?: boolean
  showSkip?: boolean
  nextLabel?: string
  position?: "top" | "bottom" | "left" | "right" | "center"
}

export function TutorialOverlay({
  isOpen,
  onClose,
  onNext,
  onSkip,
  targetSelector,
  title,
  description,
  step,
  totalSteps,
  showNext = true,
  showSkip = true,
  nextLabel = "Next",
  position = "bottom",
}: TutorialOverlayProps) {
  const t = useTranslations()
  useEffect(() => {
    if (isOpen && targetSelector) {
      // Track element highlighted
      trackEvent(AnalyticsEvent.ONBOARDING_TUTORIAL_ELEMENT_HIGHLIGHTED, {
        [AnalyticsProperty.ONBOARDING_STEP]: targetSelector,
        [AnalyticsProperty.ONBOARDING_STEP_NUMBER]: step,
      })
    }
  }, [isOpen, targetSelector, step])

  useEffect(() => {
    if (isOpen) {
      // Prevent body scroll when overlay is open
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }

    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  if (!isOpen) return null

  const getTargetElement = () => {
    if (!targetSelector) return null
    return document.querySelector(targetSelector) as HTMLElement | null
  }

  const targetElement = getTargetElement()

  // Log warning if target element not found
  if (!targetElement && targetSelector) {
    console.warn(`[TutorialOverlay] Target element not found for selector: "${targetSelector}"`)
  }

  let tooltipStyle: React.CSSProperties = {}
  let arrowStyle: React.CSSProperties = {}

  if (targetElement) {
    const rect = targetElement.getBoundingClientRect()
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft
    const viewportPadding = 16 // Padding from viewport edges
    const tooltipMaxWidth = 448 // max-w-md = 28rem = 448px

    switch (position) {
      case "bottom":
        // Calculate ideal centered position
        let leftPos = rect.left + scrollLeft + rect.width / 2

        // Ensure tooltip doesn't overflow viewport
        const tooltipHalfWidth = tooltipMaxWidth / 2
        const minLeft = viewportPadding
        const maxLeft = window.innerWidth - viewportPadding

        // Clamp the position to ensure tooltip stays within bounds
        const clampedLeft = Math.max(
          minLeft + tooltipHalfWidth,
          Math.min(maxLeft - tooltipHalfWidth, leftPos)
        )

        tooltipStyle = {
          position: "absolute",
          top: `${rect.bottom + scrollTop + 16}px`,
          left: `${clampedLeft}px`,
          transform: "translateX(-50%)",
          maxWidth: `${tooltipMaxWidth}px`,
        }
        arrowStyle = {
          top: "-8px",
          left: "50%",
          transform: "translateX(-50%) rotate(180deg)",
        }
        break
      case "top":
        tooltipStyle = {
          position: "absolute",
          bottom: `${window.innerHeight - (rect.top + scrollTop) + 16}px`,
          left: `${rect.left + scrollLeft + rect.width / 2}px`,
          transform: "translateX(-50%)",
        }
        arrowStyle = {
          bottom: "-8px",
          left: "50%",
          transform: "translateX(-50%)",
        }
        break
      case "left":
        tooltipStyle = {
          position: "absolute",
          top: `${rect.top + scrollTop + rect.height / 2}px`,
          right: `${window.innerWidth - (rect.left + scrollLeft) + 16}px`,
          transform: "translateY(-50%)",
        }
        arrowStyle = {
          right: "-8px",
          top: "50%",
          transform: "translateY(-50%) rotate(-90deg)",
        }
        break
      case "right":
        tooltipStyle = {
          position: "absolute",
          top: `${rect.top + scrollTop + rect.height / 2}px`,
          left: `${rect.right + scrollLeft + 16}px`,
          transform: "translateY(-50%)",
        }
        arrowStyle = {
          left: "-8px",
          top: "50%",
          transform: "translateY(-50%) rotate(90deg)",
        }
        break
      case "center":
      default:
        tooltipStyle = {
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }
        break
    }
  } else {
    // Center if no target element
    tooltipStyle = {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    }
  }

  const handleOverlayClick = (onSkip || onClose) as () => void

  // Check if a dialog is open (dialogs use z-50)
  // If so, we need to use a lower z-index to stay behind it
  const overlayZIndex = 40 // Below dialog z-50 but above most content
  const highlightZIndex = 41 // Slightly above overlay
  const tooltipZIndex = 42 // Above highlight ring but below dialog

  const overlay = (
    <>
      {/* Four-piece overlay that creates a cutout for the target element */}
      {targetElement ? (
        <>
          {/* Top overlay */}
          <div
            className="fixed left-0 right-0 bg-black/50"
            style={{
              top: 0,
              height: `${targetElement.getBoundingClientRect().top}px`,
              zIndex: overlayZIndex,
            }}
            onClick={handleOverlayClick}
          />
          {/* Bottom overlay */}
          <div
            className="fixed left-0 right-0 bg-black/50"
            style={{
              top: `${targetElement.getBoundingClientRect().bottom}px`,
              bottom: 0,
              zIndex: overlayZIndex,
            }}
            onClick={handleOverlayClick}
          />
          {/* Left overlay */}
          <div
            className="fixed bg-black/50"
            style={{
              top: `${targetElement.getBoundingClientRect().top}px`,
              left: 0,
              width: `${targetElement.getBoundingClientRect().left}px`,
              height: `${targetElement.getBoundingClientRect().height}px`,
              zIndex: overlayZIndex,
            }}
            onClick={handleOverlayClick}
          />
          {/* Right overlay */}
          <div
            className="fixed bg-black/50"
            style={{
              top: `${targetElement.getBoundingClientRect().top}px`,
              left: `${targetElement.getBoundingClientRect().right}px`,
              right: 0,
              height: `${targetElement.getBoundingClientRect().height}px`,
              zIndex: overlayZIndex,
            }}
            onClick={handleOverlayClick}
          />
          {/* Highlight ring around the target */}
          <div
            className="fixed pointer-events-none border-4 border-white/80 animate-pulse"
            style={{
              top: `${targetElement.getBoundingClientRect().top - 4}px`,
              left: `${targetElement.getBoundingClientRect().left - 4}px`,
              width: `${targetElement.offsetWidth + 8}px`,
              height: `${targetElement.offsetHeight + 8}px`,
              borderRadius: "12px",
              zIndex: highlightZIndex,
            }}
          />
        </>
      ) : (
        /* Full overlay if no target element */
        <div
          className="fixed inset-0 bg-black/50"
          style={{ zIndex: overlayZIndex }}
          onClick={handleOverlayClick}
        />
      )}

      {/* Tooltip */}
      <div
        className="fixed bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-6 w-full"
        style={{
          ...tooltipStyle,
          maxWidth: "min(28rem, calc(100vw - 2rem))", // max-w-md with viewport padding
          zIndex: tooltipZIndex,
        }}
      >
        {/* Arrow */}
        {targetElement && position !== "center" && (
          <div
            className="absolute w-0 h-0 border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-white dark:border-b-gray-800"
            style={arrowStyle}
          />
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Progress */}
        {step && totalSteps && (
          <div className="text-sm text-muted-foreground mb-2">
            {t('onboarding.progress', { current: step, total: totalSteps })}
          </div>
        )}

        {/* Content */}
        <h3 className="text-xl font-semibold mb-2 pr-6">{title}</h3>
        <p className="text-muted-foreground mb-6">{description}</p>

        {/* Actions */}
        <div className="flex justify-between items-center gap-4">
          {showSkip && (
            <Button variant="ghost" onClick={onSkip || onClose}>
              {t('onboarding.skipTour')}
            </Button>
          )}
          <div className="flex-1" />
          {showNext && onNext && (
            <Button onClick={onNext}>
              {nextLabel}
            </Button>
          )}
        </div>
      </div>
    </>
  )

  return createPortal(overlay, document.body)
}
