"use client"

import { useState } from "react"
import { TripCard } from "@/components/common/trip-card"
import type { Trip } from "@/lib/dtos/trip"

const INITIAL_VISIBLE = 3

interface PastTripsSectionProps {
  trips: Trip[]
}

export function PastTripsSection({ trips }: PastTripsSectionProps) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? trips : trips.slice(0, INITIAL_VISIBLE)
  const hidden = trips.length - INITIAL_VISIBLE

  return (
    <div className="flex flex-col gap-3">
      {visible.map((trip) => (
        <TripCard key={trip.id} trip={trip} />
      ))}
      {!showAll && hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors text-left py-1"
        >
          Show {hidden} more past {hidden === 1 ? "trip" : "trips"}
        </button>
      )}
      {showAll && trips.length > INITIAL_VISIBLE && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors text-left py-1"
        >
          Show less
        </button>
      )}
    </div>
  )
}
