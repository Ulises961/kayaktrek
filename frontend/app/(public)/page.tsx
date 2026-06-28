import { redirect } from "next/navigation"
import { LandingHero } from "@/components/landing/landing-hero"
import { getSession } from "@/lib/auth/session"
import { apiGetPublic } from "@/lib/api/client"
import { PublicItinerariesSchema, PublicItineraryDetailSchema } from "@/lib/dtos/itinerary"
import { extractRouteData } from "@/lib/itinerary/public-routes"
import type { RouteData } from "@/lib/itinerary/public-routes"

async function fetchLandingRoutes(): Promise<RouteData[]> {
  try {
    const list = PublicItinerariesSchema.parse(
      await apiGetPublic<unknown[]>("/api/itinerary/explore"),
    )
    const ids = list.map((i) => i.id).filter(Boolean) as string[]
    const details = await Promise.all(
      ids.slice(0, 20).map(async (id) => {
        try {
          const raw = await apiGetPublic<unknown>(`/api/itinerary/${id}/public`)
          return PublicItineraryDetailSchema.parse(raw)
        } catch {
          return null
        }
      }),
    )
    return details.filter(Boolean).map((d) => extractRouteData(d!))
  } catch {
    return []
  }
}

export default async function LandingPage() {
  const session = await getSession()
  if (session) redirect("/dashboard")

  const routes = await fetchLandingRoutes()

  return <LandingHero routes={routes} />
}
