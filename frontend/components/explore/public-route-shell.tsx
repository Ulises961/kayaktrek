"use client"

import { useState, type ReactNode } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

// Named so the toggle can point `aria-controls` at what it opens.
const PANEL_ID = "route-detail-panel"

type PublicRouteShellProps = {
  /** The map column — full-bleed at every width. */
  map: ReactNode
  /** The detail panel itself, normally `PublicRouteDetail`. */
  children: ReactNode
}

/**
 * The page shell shared by `/routes/[id]` and `/story/[token]`: a map with the
 * route detail on a collapsible right-hand panel.
 *
 * It is a right-hand panel at every width, open at every width, and collapsed by
 * the same control at every width — that sameness is the point, not a constraint
 * worked around. What differs is only how the panel takes its space: below `md`
 * it lies over a full-bleed map, because the panel alone is wider than a 320px
 * viewport and docking it there would leave the map nothing (M18 §5); from `md`
 * it is a flex sibling, so collapsing it gives the map the width rather than
 * merely uncovering it.
 *
 * The map's `ResizeHandler` is what keeps Leaflet honest when that happens —
 * without it the newly exposed strip stays grey.
 */
export function PublicRouteShell({ map, children }: PublicRouteShellProps) {
  // Open on arrival, everywhere. The detail is what a shared link is for, and the
  // toggle on its edge is what says the map is under there.
  const [open, setOpen] = useState(true)

  return (
    // `dvh`, not `vh`: on a phone `100vh` is the height with the browser's address bar
    // retracted, so the foot of the panel — the call to action — sat under it.
    <div className="relative flex h-dvh w-full overflow-hidden">
      <div className="relative min-h-0 min-w-0 flex-1">{map}</div>

      <div
        data-testid="route-detail-drawer"
        data-state={open ? "open" : "closed"}
        className={cn(
          // Base — an overlay anchored to the right edge. Clipped by the shell's
          // `overflow-hidden` once it is off-screen, so a collapsed panel cannot
          // scroll the page sideways.
          "absolute inset-y-0 right-0 z-[1001] translate-x-full shadow-2xl transition-transform duration-200 ease-out data-[state=open]:translate-x-0",
          // From `md` — back in the row. Collapsed is `w-0` rather than `hidden`
          // so the toggle keeps riding on the panel's edge and stays in reach.
          "md:relative md:inset-auto md:w-0 md:translate-x-0 md:shadow-none md:transition-none md:data-[state=open]:w-96",
        )}
      >
        {/* Outside the panel, or collapsing it would make the only way back inert
            too. The wrapper carries the positioning so `touch-target`'s
            `position: relative` cannot fight it. */}
        <div className="absolute top-1/2 left-0 -translate-x-full -translate-y-1/2">
          <button
            type="button"
            onClick={() => setOpen((wasOpen) => !wasOpen)}
            aria-expanded={open}
            aria-controls={PANEL_ID}
            data-testid="route-detail-toggle"
            className="touch-target border-border bg-background text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex h-16 w-6 items-center justify-center rounded-l-md border border-r-0 shadow-md outline-none focus-visible:ring-[3px]"
          >
            {open ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
            <span className="sr-only">{open ? "Hide route details" : "Show route details"}</span>
          </button>
        </div>

        <div
          id={PANEL_ID}
          inert={!open}
          className="h-full w-[85vw] max-w-[20rem] md:w-96 md:max-w-none"
        >
          {children}
        </div>
      </div>
    </div>
  )
}
