"use client"

import dynamic from "next/dynamic"
import type { RouteData } from "@/lib/itinerary/public-routes"

const PublicMap = dynamic(() => import("./public-map"), { ssr: false })

type Props = {
  routes?: RouteData[]
}

export default function MapLoader({ routes }: Props) {
  return <PublicMap routes={routes} />
}
