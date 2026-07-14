import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CardTopRule } from "@/components/common/card-top-rule"
import { RouteThumbnail } from "@/components/common/route-thumbnail"
import { StateBadge } from "@/components/common/state-badge"
import { UsersIcon, CalendarIcon, ClockIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Trip, TripState } from "@/lib/dtos/trip"
import type { RouteData } from "@/lib/itinerary/public-routes"
import { daysBetween, formatDateRange } from "@/lib/trips/format"

interface TripCardProps {
  trip: Trip
  hero?: boolean
  /** The trip's own plotted route, drawn as a chart banner above the header (M12 §E). */
  route?: RouteData | null
}

const STATE_ACCENT: Record<TripState, string> = {
  building: "var(--state-planning-fg)",
  happening: "var(--state-happening-fg)",
  past: "var(--state-past-fg)",
}

export function TripCard({ trip, hero = false, route = null }: TripCardProps) {
  const { id, destination, state, dateFrom, dateTo, travellers } = trip
  const crewCount = travellers?.length ?? 0
  const days = dateFrom && dateTo ? daysBetween(dateFrom, dateTo) : null

  return (
    <Link href={`/trips/${id}`}>
      <Card
        className={cn(
          "relative cursor-pointer gap-0 overflow-hidden py-0 transition-colors",
          hero ? "border-l-[4px]" : "hover:bg-secondary/50 border-l-[3px]",
        )}
        style={{
          borderLeftColor: state ? STATE_ACCENT[state] : undefined,
          ...(hero ? { backgroundColor: "var(--state-happening-bg)" } : {}),
        }}
      >
        <CardTopRule className="absolute inset-x-0 top-0 z-[1002]" />
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
