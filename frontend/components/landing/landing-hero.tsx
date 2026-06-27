import Link from "next/link"
import { LandingMapLoader } from "./landing-map-loader"
import { CompassRose } from "./compass-rose"
import type { RouteData } from "@/lib/itinerary/public-routes"

export function LandingHero({ routes = [] }: { routes?: RouteData[] }) {
  return (
    <div className="relative h-screen w-full overflow-hidden">
      {/* Live sea chart */}
      <div className="absolute inset-0">
        <LandingMapLoader routes={routes} />
      </div>

      {/* Neat-line frame (graticule lines + labels are drawn on the map itself) */}
      <div className="chart-neatline chart-anim-fade z-[1000]" />

      {/* Header — chart publication strip */}
      <header className="chart-header absolute top-0 right-0 left-0 z-[1001] flex items-center justify-between px-5 py-3 sm:px-7">
        <Link href="/" className="flex items-center gap-2.5">
          <CompassRose size={26} />
          <span className="chart-wordmark text-[0.95rem] sm:text-base">
            Kayak Expedition Planner
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-3">
          <Link href="/login" className="chart-link hidden px-2 py-1.5 sm:inline-block">
            Log in
          </Link>
          <Link href="/register" className="chart-btn-primary px-3.5 py-2 sm:px-4">
            Start planning
          </Link>
        </nav>
      </header>

      {/* Cartouche — title block / signature */}
      <div className="chart-cartouche chart-anim-rise absolute bottom-7 left-1/2 z-[1001] w-[min(26rem,calc(100%-3rem))] -translate-x-1/2 p-6 sm:bottom-9 sm:left-9 sm:translate-x-0 sm:p-7">
        <p className="chart-eyebrow">Sea-kayak expedition planning</p>
        <h1 className="chart-tagline mt-3 text-[2rem] sm:text-[2.35rem]">
          Plan the passage.
          <br />
          <em>Paddle it with your crew.</em>
        </h1>
        <div className="chart-rule mt-4" />
        <p className="chart-invite mt-4">
          A growing chart of paddled waters — add the one you know best.
        </p>
        <div className="mt-5 flex items-center gap-4">
          <Link href="/register" className="chart-btn-primary px-4 py-2.5">
            Start planning
          </Link>
          <Link href="/login" className="chart-link">
            browse the chart →
          </Link>
        </div>
      </div>
    </div>
  )
}
