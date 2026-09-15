import Link from "next/link"
import { ChartHeaderBar } from "@/components/common/chart-header"
import { Button } from "@/components/ui/button"
import { ctaButtonClass } from "@/components/common/button-roles"
import { cn } from "@/lib/utils"
import { ExploreDiscovery } from "@/components/explore/explore-discovery"
import { DiscoveryIntro } from "./discovery-intro"
import type { ExplorePage } from "@/lib/dtos/itinerary"
import { DISTANCE_UNIT } from "@/lib/itinerary/distance"

// Chart-variant overrides on the DS Button: the wider letter-spacing of engraved
// chart lettering, at the header's more compact size. Corners stay the primitive's
// default `rounded-md` — squaring them off read as a harder shape than the plain-text
// "Log in" beside it, and the cartouche's own CTA (same role) is already rounded.
const chartCta = "text-xs tracking-[0.04em]"
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
 * Sign up / Log in live in the header, not the pitch: `DiscoveryIntro` floats over the
 * map and dismisses on its own "Explore" action, so it can't also be the one place
 * carrying auth entry points — those need to survive the dismiss.
 */
export function LandingExplore({ initial }: { initial: ExplorePage }) {
  return (
    // `h-svh`, not `min-h-svh`: ExploreDiscovery's desktop layout (`xl:h-full` on the map,
    // `xl:overflow-y-auto` on the results column) needs a definite height to resolve its
    // percentage-height chain against. `min-height` alone leaves this container's own height
    // "auto" for CSS sizing purposes even though flex-grow gives it a real box on screen, so
    // every descendant's `h-full`/`xl:h-full` collapsed to 0 (clamped up by `min-h-48`) —
    // the map never got a height and the results column never got its internal scroll. An
    // explicit height doesn't break shorter viewports: children still overflow visibly past
    // it (nothing here clips), so the document scrolls exactly as it did with `min-h-svh`.
    <div className="flex h-svh flex-col">
      <ChartHeaderBar
        className="sticky top-0 z-[1001]"
        nav={
          // Its own gap, wider than the header nav's default gap-1/sm:gap-3 —
          // that spacing also separates this group from ThemeToggle, and
          // widening it there would nudge every ChartHeaderBar caller's toggle
          // rather than just space these two CTAs apart from each other.
          <div className="flex items-center gap-3 sm:gap-4">
            <Link href="/login" className={chartLink}>
              Log in
            </Link>
            <Button asChild size="sm" className={cn(chartCta, ctaButtonClass)}>
              <Link href="/register">Sign up</Link>
            </Button>
          </div>
        }
      />

      <DiscoveryIntro />

      {/* The library itself. Unwrapped (no border/padding), same as
          `(app)/explore/page.tsx` — a full-bleed map is the page, not a padded panel. */}
      <div className="min-h-0 flex-1">
        <ExploreDiscovery initial={initial} unit={DISTANCE_UNIT.NM} chartFurniture />
      </div>

      <footer className="border-border flex items-center justify-end gap-2 border-t px-4 py-3 sm:px-7">
        <Link href="/about" className={cn(chartLink, "text-[11px]")}>
          About
        </Link>
        <span aria-hidden className={cn(chartLink, "text-[11px] opacity-50")}>
          ·
        </span>
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
