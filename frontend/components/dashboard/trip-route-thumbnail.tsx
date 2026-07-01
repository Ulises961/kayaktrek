import { LandingMapLoader } from "@/components/landing/landing-map-loader"
import type { RouteData } from "@/lib/itinerary/public-routes"

// A compact, non-interactive route thumbnail for a trip card — the same Esri sea
// chart as the landing, framed tight on this trip's passage (banner variant: no
// forecast cell or scale bar). `pointer-events-none` so clicks fall through to the
// parent card link instead of being captured by the map.
export function TripRouteThumbnail({ route }: { route: RouteData }) {
  return (
    <div aria-hidden className="pointer-events-none h-28 w-full sm:h-32">
      <LandingMapLoader routes={[route]} interactive={false} variant="banner" />
    </div>
  )
}
