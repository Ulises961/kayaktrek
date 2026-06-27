import { LandingHero } from "@/components/landing/landing-hero"
import type { RouteData } from "@/lib/itinerary/public-routes"

// Public preview of the redesigned landing page. Mirrors what app/page.tsx
// will become; uses a sample route so the chrome can be judged with content.
// Delete once the design is promoted to app/page.tsx.
const SAMPLE_ROUTES: RouteData[] = [
  {
    id: "sample-costa-brava",
    name: "Costa Brava — Roses to Cap de Creus",
    positions: [
      [42.268, 3.176],
      [42.288, 3.231],
      [42.312, 3.288],
      [42.29, 3.33],
      [42.246, 3.31],
      [42.19, 3.226],
      [42.118, 3.165],
    ],
    dayCount: 4,
    totalMiles: 33.5,
  },
]

export default function LandingPreviewPage() {
  return <LandingHero routes={SAMPLE_ROUTES} />
}
