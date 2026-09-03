import { Anchor, CircleDot } from "lucide-react"
import { cn } from "@/lib/utils"
import { POINT_TYPE } from "@/lib/dtos/point"

// Shared pieces of the stop-to-stop timeline rail — the vertical thread a stop
// list draws itself on, used identically by the authenticated builder's Route
// tab (`feature-drawer.tsx`) and the public route detail page's daily
// breakdown (`route-day-breakdown.tsx`). Row layout, click behaviour and
// touch-target sizing stay local to each caller — those genuinely differ (one
// selects a point on a live map, the other is static pitch content) — but the
// rail itself is the same visual mechanism in both places, so it lives once.

// Past this many, the rail shows this many dots regardless — the point is
// "several", not a literal count (the caller's aria-label / expanded rows
// carry the real number).
export const VIA_DOTS_CAP = 4

// One vertical segment of the rail: solid where two stops are adjacent,
// dashed where positions were aggregated into the leg it spans, omitted at
// the first/last row or wherever an adjacent element (the via toggle) already
// draws the segment's continuation.
export function railConnectorClass(dashed: boolean, hidden: boolean) {
  return cn(
    "w-0 flex-1",
    hidden ? "" : dashed ? "border-l border-dashed border-border" : "border-l border-border",
  )
}

// The rail's own glyph for "positions were aggregated here" — one dot per
// position, capped so a long crossing doesn't stretch the rail. Reads
// anchor — waypoint(s) — anchor without a chevron or a count in words; the
// exact count belongs in the caller's aria-label and expanded rows.
export function ViaDots({ count }: { count: number }) {
  return (
    <span className="flex flex-col items-center gap-[3px] py-[3px]">
      {Array.from({ length: Math.min(count, VIA_DOTS_CAP) }).map((_, i) => (
        <span key={i} aria-hidden className="bg-muted-foreground/70 size-1 shrink-0 rounded-full" />
      ))}
    </span>
  )
}

// stop (anchor) vs position (pass-through geometry) — the one icon mapping
// every stop-list row in the app uses.
export function RailTypeIcon({ type, className }: { type: string; className?: string }) {
  if (type === POINT_TYPE.STOP) return <Anchor className={cn("shrink-0", className)} />
  return <CircleDot className={cn("shrink-0", className)} />
}
