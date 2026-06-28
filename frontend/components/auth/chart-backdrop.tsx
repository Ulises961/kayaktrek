import { LandingMapLoader } from "@/components/landing/landing-map-loader"
import type { RouteData } from "@/lib/itinerary/public-routes"

// Frozen nautical-chart backdrop for the auth pages — the same living sea chart as
// the landing, but non-interactive and dimmed behind a paper scrim so the form card
// stays the focus. Light-only (matches the landing). Pin it as a fixed -z layer and
// render the auth card on top.
export function ChartBackdrop({ routes = [] }: { routes?: RouteData[] }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 select-none">
      <LandingMapLoader routes={routes} interactive={false} />
      {/* Paper scrim — calms the chart and lifts form legibility. Slightly heavier
          toward the centre where the card sits. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklch,var(--chart-paper)_64%,transparent)_0%,color-mix(in_oklch,var(--chart-paper)_30%,transparent)_70%)]" />
    </div>
  )
}
