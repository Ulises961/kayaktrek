import Link from "next/link"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import MapLoader from "@/components/map/map-loader"
import { getSession } from "@/lib/auth/session"
import { searchPublicItineraries, fetchPublicRouteData } from "@/lib/itinerary/actions"
import type { RouteData } from "@/lib/itinerary/public-routes"

async function fetchLandingRoutes(): Promise<RouteData[]> {
  try {
    const page = await searchPublicItineraries({ perPage: 20 })
    const routes = await Promise.all(page.items.map((item) => fetchPublicRouteData(item.id)))
    return routes.filter((r): r is RouteData => r !== null)
  } catch {
    return []
  }
}

export default async function LandingPage() {
  const session = await getSession()
  if (session) redirect("/dashboard")

  const routes = await fetchLandingRoutes()

  return (
    <div className="relative h-screen w-full overflow-hidden">
      {/* Full-screen map */}
      <div className="absolute inset-0">
        <MapLoader routes={routes} />
      </div>

      {/* Top bar */}
      <div className="absolute top-0 right-0 left-0 z-[1001] flex items-center justify-between border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur-sm">
        <span className="font-semibold tracking-tight text-slate-900">
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
        <div className="absolute bottom-6 left-1/2 z-[1001] -translate-x-1/2">
          <div className="rounded-full border border-slate-200 bg-white/90 px-4 py-1.5 text-sm text-slate-700 shadow backdrop-blur-sm">
            {routes.length} public {routes.length === 1 ? "route" : "routes"} shared by the
            community
          </div>
        </div>
      )}
    </div>
  )
}
