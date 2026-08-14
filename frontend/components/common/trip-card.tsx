import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RouteThumbnail } from "@/components/common/route-thumbnail"
import { StateBadge } from "@/components/common/state-badge"
import { UsersIcon, CalendarIcon, ClockIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Trip } from "@/lib/dtos/trip"
import type { RouteData } from "@/lib/itinerary/public-routes"
import { daysBetween, formatDateRange } from "@/lib/trips/format"

interface TripCardProps {
  trip: Trip
  hero?: boolean
  /** The trip's own plotted route, drawn as a chart banner above the header (M12 §E). */
  route?: RouteData | null
}

export function TripCard({ trip, hero = false, route = null }: TripCardProps) {
  const { id, destination, state, dateFrom, dateTo, travellers } = trip
  const crewCount = travellers?.length ?? 0
  const days = dateFrom && dateTo ? daysBetween(dateFrom, dateTo) : null

  return (
    <Link href={`/trips/${id}`}>
      {/* One signal per fact. The card used to say its state three ways at once — a
          state-coloured left border, the chart top rule, and the badge — with the rule
          identical on every card, so a stripe carrying nothing sat at 90° to a stripe
          carrying something. The badge says it in words; the border and the rule are gone.
          A hero is marked by a foam ring rather than a filled ground: `--state-happening-bg`
          is a *pill* tint, sized for a word on a badge, and stretched across a whole card it
          turned the content's own background a colour. A ring says "this one" without
          recolouring everything inside it. */}
      <Card
        className={cn(
          "relative isolate cursor-pointer gap-0 overflow-hidden py-0 transition-colors",
          hero ? "ring-foam/70 ring-2" : "hover:bg-secondary/50",
        )}
      >
        {route && <RouteThumbnail route={route} className="h-24 sm:h-28" />}
        <CardHeader className="px-3 pt-3 pb-1.5">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <CardTitle
              className={cn(
                "min-w-0 truncate leading-snug font-semibold",
                hero ? "text-base" : "text-sm",
              )}
            >
              {destination ?? "Untitled trip"}
            </CardTitle>
            {state && <StateBadge state={state} className="shrink-0 self-start" />}
          </div>
        </CardHeader>
        <CardContent className="space-y-0.5 px-3 pt-0 pb-3">
          <div className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
            <CalendarIcon className="size-3 shrink-0" />
            <span>{formatDateRange(dateFrom, dateTo)}</span>
          </div>
          <div className="text-muted-foreground flex items-center gap-2 text-[11px]">
            {days !== null && (
              <>
                <span className="flex items-center gap-1">
                  <ClockIcon className="size-3 shrink-0" />
                  <span className="font-mono tabular-nums">{days}</span>{" "}
                  {days === 1 ? "day" : "days"}
                </span>
                <span className="text-muted-foreground/40" aria-hidden>
                  ·
                </span>
              </>
            )}
            <span className="flex items-center gap-1">
              <UsersIcon className="size-3 shrink-0" />
              <span className="font-mono tabular-nums">{crewCount}</span>{" "}
              {crewCount === 1 ? "member" : "members"}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
