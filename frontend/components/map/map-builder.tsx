"use client"
import { useState } from "react"
import dynamic from "next/dynamic"
import { useCollapseSidebar } from "@/hooks/use-collapse-sidebar"
import { MapTopBar } from "./map-top-bar"
import type { MapMode } from "./map-top-bar"
import type { Itinerary } from "@/lib/dtos/itinerary"

const MapCore = dynamic(() => import("./map-core"), { ssr: false })

type MapBuilderProps = {
  itinerary: Itinerary
  tripId: string
  tripName: string
}

export function MapBuilder({ itinerary, tripId, tripName }: MapBuilderProps) {
  useCollapseSidebar()
  const [mode, setMode] = useState<MapMode>("drop")
  const [distanceUnit, setDistanceUnit] = useState<"nm" | "km">("nm")
  const [isSaving] = useState(false)

  const dayCount = itinerary.days?.filter((d) => d.dayNumber > 0).length ?? 0

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <MapTopBar
        tripId={tripId}
        tripName={tripName}
        mode={mode}
        onModeChange={setMode}
        distanceUnit={distanceUnit}
        onDistanceUnitChange={setDistanceUnit}
        totalDistance={0}
        dayCount={dayCount}
        isSaving={isSaving}
      />
      <div className="absolute inset-0 top-12">
        <MapCore itinerary={itinerary} mode={mode} distanceUnit={distanceUnit} />
      </div>
    </div>
  )
}
