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
    points: [
      { lat: 42.268, lon: 3.176, type: "stop", name: "Roses" },
      { lat: 42.288, lon: 3.231, type: "position", name: null },
      { lat: 42.312, lon: 3.288, type: "stop", name: "Cala Montjoi" },
      { lat: 42.29, lon: 3.33, type: "position", name: null },
      { lat: 42.246, lon: 3.31, type: "stop", name: "Cadaqués" },
      { lat: 42.19, lon: 3.226, type: "position", name: null },
      { lat: 42.118, lon: 3.165, type: "stop", name: "Cap de Creus" },
    ],
    dayCount: 4,
    totalMiles: 33.5,
  },
]

export default function LandingPreviewPage() {
  return <LandingHero routes={SAMPLE_ROUTES} />
}
