"use client"

import { useState } from "react"
import { TripCard } from "@/components/common/trip-card"
import type { Trip } from "@/lib/dtos/trip"
import type { RouteData } from "@/lib/itinerary/public-routes"

const INITIAL_VISIBLE = 3

interface PastTripsSectionProps {
  trips: Trip[]
  /** Trip id → its plotted route, fetched server-side by the trips page (M12 §E). */
  routesById?: Record<string, RouteData | null>
}

export function PastTripsSection({ trips, routesById = {} }: PastTripsSectionProps) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? trips : trips.slice(0, INITIAL_VISIBLE)
  const hidden = trips.length - INITIAL_VISIBLE

  return (
    <div className="flex flex-col gap-3">
      {visible.map((trip) => (
        <TripCard key={trip.id} trip={trip} route={routesById[trip.id ?? ""]} />
      ))}
      {!showAll && hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-muted-foreground hover:text-foreground py-1 text-left text-xs transition-colors"
        >
          Show {hidden} more past {hidden === 1 ? "trip" : "trips"}
        </button>
      )}
      {showAll && trips.length > INITIAL_VISIBLE && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="text-muted-foreground hover:text-foreground py-1 text-left text-xs transition-colors"
        >
          Show less
        </button>
      )}
    </div>
  )
}
