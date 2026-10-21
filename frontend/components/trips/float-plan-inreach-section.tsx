"use client"

import { SatelliteDishIcon, TriangleAlertIcon } from "lucide-react"
import { FloatPlanHeading } from "@/components/trips/float-plan-heading"
import { FloatPlanPanel } from "@/components/trips/float-plan-panel"
import { SatelliteTrackingSwitch } from "@/components/trips/satellite-tracking-switch"
import { satelliteTrackingIsOff } from "@/lib/trips/satellite"
import type { TripState } from "@/lib/dtos/trip"
import type { TripMember } from "@/lib/dtos/trip-member"

interface FloatPlanInReachSectionProps {
  tripId: string
  tripState: TripState | null | undefined
  currentMember: TripMember
  /** Whether the user has a satellite feed registered in Settings (M29). */
  hasSatelliteFeed: boolean
}

// The member's own inReach switch, and the one place that says when it is off while it
// should not be: a happening trip, a registered feed, and the switch left off. The caller
// decides whether the switch is offered at all (`canShareSatellitePosition`).
export function FloatPlanInReachSection({
  tripId,
  tripState,
  currentMember,
  hasSatelliteFeed,
}: FloatPlanInReachSectionProps) {
  const trackingOff = satelliteTrackingIsOff(tripState, currentMember, hasSatelliteFeed)

  return (
    <FloatPlanPanel aria-label="inReach">
      <FloatPlanHeading icon={<SatelliteDishIcon className="size-4" />}>inReach</FloatPlanHeading>
      {trackingOff && (
        <div className="border-notice-border bg-notice-bg text-notice-ink flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          <p className="min-w-0 flex-1">inReach is off, so your position is not being shared.</p>
        </div>
      )}
      <SatelliteTrackingSwitch
        tripId={tripId}
        enabled={!!currentMember.sharesSatellitePosition}
        hasFeed={hasSatelliteFeed}
      />
    </FloatPlanPanel>
  )
}
