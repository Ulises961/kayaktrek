import { LandingMapLoader } from "@/components/landing/landing-map-loader"
import { cn } from "@/lib/utils"
import type { RouteData } from "@/lib/itinerary/public-routes"

// A compact, non-interactive route thumbnail for a listing card — the same sea
// chart as the landing, framed tight on the route's passage (banner variant: no
// forecast cell or scale bar). Shared by the dashboard hero, trips list and
// explore cards. `pointer-events-none` so clicks fall through to the parent
// card link instead of being captured by the map.
export function RouteThumbnail({ route, className }: { route: RouteData; className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none h-28 w-full sm:h-32", className)}>
      <LandingMapLoader routes={[route]} interactive={false} variant="banner" />
    </div>
  )
}
