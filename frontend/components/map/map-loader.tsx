"use client"

import dynamic from "next/dynamic"
import type { RouteData } from "@/lib/itinerary/public-routes"
import type { LivePosition } from "@/lib/dtos/live-position"

const PublicMap = dynamic(() => import("./public-map"), { ssr: false })

type Props = {
  routes?: RouteData[]
  livePositions?: LivePosition[]
}

export default function MapLoader({ routes, livePositions }: Props) {
  return <PublicMap routes={routes} livePositions={livePositions} />
}
