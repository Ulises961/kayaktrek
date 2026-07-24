"use client"

import MapLoader from "@/components/map/map-loader"
import { useLivePositions } from "@/hooks/use-live-positions"
import { API_PREFIX, SSE_URL } from "@/lib/api/config"
import type { RouteData } from "@/lib/itinerary/public-routes"

type Props = {
  token: string
  routes: RouteData[]
}

export function LiveStoryMap({ token, routes }: Props) {
  const { positions, status } = useLivePositions(
    `${SSE_URL}${API_PREFIX}/live/story/${token}/stream`,
  )
  const showPill = status === "live" && positions.length > 0

  return (
    <div className="relative h-full w-full">
      {showPill && (
        <div className="bg-destructive absolute top-3 left-3 z-[1001] flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white shadow">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
          LIVE · {positions.length} {positions.length === 1 ? "paddler" : "paddlers"}
        </div>
      )}
      <MapLoader routes={routes} livePositions={positions} />
    </div>
  )
}
