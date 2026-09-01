import Link from "next/link"
import { ChartHeaderBar } from "@/components/common/chart-header"
import { Button } from "@/components/ui/button"
import { ctaButtonClass } from "@/components/common/button-roles"
import { cn } from "@/lib/utils"
import { ExploreDiscovery } from "@/components/explore/explore-discovery"
import {
  Cartouche,
  CartoucheEyebrow,
  CartoucheTitle,
  CartoucheRule,
  CartoucheNote,
} from "./cartouche"
import type { ExplorePage } from "@/lib/dtos/itinerary"
import { DISTANCE_UNIT } from "@/lib/itinerary/distance"

// Chart-variant overrides on the DS Button: square neat-line corners + the wider
// letter-spacing of engraved chart lettering.
const chartCta = "rounded-[2px] text-xs tracking-[0.04em]"
const chartLink =
  "text-foreground hover:text-primary px-0 text-xs tracking-[0.02em] no-underline hover:no-underline"

/**
 * The anonymous root: the public route library, framed as a chart.
 *
 * It replaces a full-screen poster whose map was decorative — `landing-map.tsx` has no
 * `Link`, `onClick` or `Popup`, so nothing on it was a door, while
 * `explore-discovery-map.tsx` has had selection, fly-to-bounds and bounds-filtering all
 * along. The two were drawing the same public itineraries; only one of them worked.
 *
 * The cartouche keeps its copy and its Sign up / Log in pair unchanged — the root is
 * still the product's pitch (ADR-034 dropped `get.kayaktrek.app` on exactly that
 * ground), so the library sits beneath the argument for it rather than replacing it.
 */
export function LandingExplore({ initial }: { initial: ExplorePage }) {
  return (
    <div className="flex min-h-svh flex-col">
      <ChartHeaderBar className="sticky top-0 z-[1001]" />

      <div className="border-border border-b px-5 py-6 sm:px-9 sm:py-8">
        <Cartouche className="max-w-[34rem] p-6 sm:p-7">
          <CartoucheEyebrow>Sea-kayak expedition planning</CartoucheEyebrow>
          <CartoucheTitle className="mt-3 text-[2rem] sm:text-[2.35rem]">
            Plan the passage.
            <br />
            <em>Paddle it with your crew.</em>
          </CartoucheTitle>
          <CartoucheRule className="mt-4" />
          <CartoucheNote className="mt-4">
            A growing chart of paddled waters — add the one you know best.
          </CartoucheNote>
          <div className="mt-5 flex items-center gap-4">
            <Button asChild size="sm" className={cn(chartCta, ctaButtonClass)}>
              <Link href="/register">Sign up</Link>
            </Button>
            <Button asChild variant="link" size="sm" className={chartLink}>
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </Cartouche>
      </div>

      {/* The library itself. `isAuthenticated={false}` is not a guess about the viewer —
          this component only ever renders for one, since a signed-in visitor is
          redirected to /dashboard before it mounts. */}
      <div className="min-h-0 flex-1">
        <ExploreDiscovery
          initial={initial}
          isAuthenticated={false}
          ownedIds={[]}
          unit={DISTANCE_UNIT.NM}
          chartFurniture
        />
      </div>

      <footer className="border-border flex items-center justify-end gap-2 border-t px-4 py-3 sm:px-7">
        <Link href="/terms" className={cn(chartLink, "text-[11px]")}>
          Terms of Use
        </Link>
        <span aria-hidden className={cn(chartLink, "text-[11px] opacity-50")}>
          ·
        </span>
        <Link href="/privacy" className={cn(chartLink, "text-[11px]")}>
          Privacy
        </Link>
      </footer>
    </div>
  )
}
