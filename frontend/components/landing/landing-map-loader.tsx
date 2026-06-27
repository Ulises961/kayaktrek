"use client"

import dynamic from "next/dynamic"
import type { RouteData } from "@/lib/itinerary/public-routes"

// Leaflet is client-only; ssr:false must live in a client component.
const LandingMap = dynamic(() => import("./landing-map").then((m) => m.LandingMap), {
  ssr: false,
})

export function LandingMapLoader({ routes }: { routes?: RouteData[] }) {
  return <LandingMap routes={routes} />
}
