import Link from "next/link"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import MapLoader from "@/components/map/map-loader"
import { getSession } from "@/lib/auth/session"
import { apiGetPublic } from "@/lib/api/client"
import { PublicItinerariesSchema, PublicItineraryDetailSchema } from "@/lib/dtos/itinerary"
import { extractRouteData } from "@/lib/itinerary/public-routes"
import type { RouteData } from "@/lib/itinerary/public-routes"

async function fetchLandingRoutes(): Promise<RouteData[]> {
  try {
    const list = PublicItinerariesSchema.parse(
      await apiGetPublic<unknown[]>("/api/itinerary/explore")
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
      })
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

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Full-screen map */}
      <div className="absolute inset-0">
        <MapLoader routes={routes} />
      </div>

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-[1001] flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-sm border-b border-slate-200">
        <span className="font-semibold text-slate-900 tracking-tight">
          Kayak Expedition Planner
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Sign up</Link>
          </Button>
        </div>
      </div>

      {/* Route count overlay */}
      {routes.length > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1001]">
          <div className="bg-white/90 backdrop-blur-sm rounded-full px-4 py-1.5 text-sm text-slate-700 shadow border border-slate-200">
            {routes.length} public {routes.length === 1 ? "route" : "routes"} shared by the community
          </div>
        </div>
      )}
    </div>
  )
}
