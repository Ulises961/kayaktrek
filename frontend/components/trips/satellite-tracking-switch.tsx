"use client"

import Link from "next/link"
import { useOptimistic, useState, useTransition } from "react"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { setSatelliteTracking } from "@/lib/trip-member/actions"

interface SatelliteTrackingSwitchProps {
  tripId: string
  /** Whether the member's switch is on for this trip, as the server last said. */
  enabled: boolean
  /** Whether the user has a satellite feed registered in Settings. */
  hasFeed: boolean
}

// M29 — the paddler's own switch for sharing their registered inReach feed on one trip.
// The feed's URL and password live in Settings; whether it feeds this trip is decided
// here, per trip, so a forgotten old trip never receives a position.
export function SatelliteTrackingSwitch({
  tripId,
  enabled,
  hasFeed,
}: SatelliteTrackingSwitchProps) {
  // Shows the new position straight away, then falls back to what the server says once
  // the request settles: a refused switch-on goes back to off, and a failed switch-off
  // goes back to on rather than claiming sharing stopped.
  const [shown, setShown] = useOptimistic(enabled)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleChange(next: boolean) {
    setError(null)
    startTransition(async () => {
      setShown(next)
      const result = await setSatelliteTracking(tripId, next)
      if (!result.success) setError(result.error)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <Switch
          id="satelliteTracking"
          checked={shown}
          onCheckedChange={handleChange}
          disabled={isPending || (!hasFeed && !shown)}
          className="mt-0.5"
        />
        <div className="flex flex-col gap-1">
          <Label htmlFor="satelliteTracking">Share my inReach on this trip</Label>
          <p className="text-muted-foreground text-xs">
            Your inReach position is posted to this trip about every 10 minutes while the trip is
            under way.
          </p>
        </div>
      </div>
      {!hasFeed && (
        <p className="text-muted-foreground text-xs">
          No inReach feed is registered, so nothing is shared. Add one in{" "}
          <Link href="/settings" className="underline">
            Settings
          </Link>
          .
        </p>
      )}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
