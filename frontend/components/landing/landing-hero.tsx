"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { LandingMapLoader } from "./landing-map-loader"
import { CompassRose } from "./compass-rose"
import {
  Cartouche,
  CartoucheEyebrow,
  CartoucheTitle,
  CartoucheRule,
  CartoucheNote,
  NeatLine,
} from "./cartouche"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { RouteData } from "@/lib/itinerary/public-routes"

// Chart-variant overrides on the DS Button: square neat-line corners + the
// wider letter-spacing of engraved chart lettering. The colours, hover and
// focus states all come from the primary/link variants.
const chartCta = "rounded-[2px] text-xs tracking-[0.04em]"
const chartLink =
  "text-foreground hover:text-primary px-0 text-xs tracking-[0.02em] no-underline hover:no-underline"

// Scroll progress 0→1 over the first `fraction` of a viewport height. Drives the
// mobile cartouche dissipate — the page scrolls (touch), the sticky map stays,
// and the title block fades up out of the way to reveal the open chart.
function useScrollProgress(fraction = 0.5): number {
  const [p, setP] = useState(0)
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const d = window.innerHeight * fraction || 1
        setP(Math.min(1, Math.max(0, window.scrollY / d)))
      })
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(raf)
    }
  }, [fraction])
  return p
}

// True below sm. Mobile is a scroll-dissipate poster with a non-interactive map;
// desktop is a fixed single-screen hero with a fully interactive chart.
function useCompact(): boolean {
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const update = () => setCompact(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  return compact
}

export function LandingHero({ routes = [] }: { routes?: RouteData[] }) {
  const compact = useCompact()
  const scroll = useScrollProgress(0.5)
  // Parallax only on mobile; desktop is a static hero so progress is pinned to 0.
  const p = compact ? scroll : 0

  return (
    <div className={compact ? "relative" : "relative h-screen w-full overflow-hidden"}>
      {/* On mobile the chart is sticky and the page scrolls past it; on desktop it
          simply fills the fixed hero (`contents` adds no box of its own). */}
      <div className={compact ? "sticky top-0 h-screen w-full overflow-hidden" : "contents"}>
        {/* Live sea chart */}
        <div className="absolute inset-0">
          <LandingMapLoader routes={routes} interactive={!compact} />
        </div>

        {/* Neat-line frame (graticule lines + labels are drawn on the map itself) */}
        <NeatLine className="chart-anim-fade z-[1000]" />

        {/* Header — chart publication strip */}
        <header className="chart-header absolute top-0 right-0 left-0 z-[1001] flex items-center justify-between px-5 py-3 sm:px-7">
          <Link href="/" className="flex items-center gap-2.5">
            <CompassRose size={26} />
            <span className="chart-wordmark text-[0.95rem] sm:text-base">
              Kayak Expedition Planner
            </span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-3">
            <Button
              asChild
              variant="link"
              size="sm"
              className={cn(chartLink, "hidden sm:inline-flex")}
            >
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild size="sm" className={chartCta}>
              <Link href="/register">Start planning</Link>
            </Button>
          </nav>
        </header>

        {/* Cartouche — title block / signature. Outer holds the placement; the
            inner box fades + rises out of the way as the mobile page scrolls
            (no-op on desktop, where p is pinned to 0). */}
        <div className="absolute bottom-7 left-1/2 z-[1001] w-[min(26rem,calc(100%-3rem))] -translate-x-1/2 sm:bottom-9 sm:left-9 sm:translate-x-0">
          <div className="chart-anim-rise">
            <Cartouche
              className="p-6 sm:p-7"
              style={{
                opacity: 1 - p,
                transform: `translateY(${(-p * 40).toFixed(1)}px)`,
                pointerEvents: p > 0.6 ? "none" : undefined,
              }}
            >
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
              <div className="mt-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
                <Button asChild className={chartCta}>
                  <Link href="/register">Start planning</Link>
                </Button>
                <Button asChild variant="link" className={chartLink}>
                  <Link href="/login">browse the chart →</Link>
                </Button>
              </div>
            </Cartouche>
          </div>
        </div>
      </div>

      {/* Scroll runway (mobile only) — gives the dissipate its travel distance */}
      {compact && <div aria-hidden className="h-[60vh]" />}
    </div>
  )
}
