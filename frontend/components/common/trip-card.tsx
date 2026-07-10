import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StateBadge } from "@/components/common/state-badge"
import { UsersIcon, CalendarIcon, ClockIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Trip, TripState } from "@/lib/dtos/trip"
import { daysBetween, formatDateRange } from "@/lib/trips/format"

interface TripCardProps {
  trip: Trip
  hero?: boolean
}

const STATE_ACCENT: Record<TripState, string> = {
  building: "var(--state-planning-fg)",
  happening: "var(--state-happening-fg)",
  past: "var(--state-past-fg)",
}

export function TripCard({ trip, hero = false }: TripCardProps) {
  const { id, destination, state, dateFrom, dateTo, travellers } = trip
  const crewCount = travellers?.length ?? 0
  const days = dateFrom && dateTo ? daysBetween(dateFrom, dateTo) : null

  return (
    <Link href={`/trips/${id}`}>
      <Card
        className={cn(
          "cursor-pointer transition-colors",
          hero ? "border-l-[4px]" : "hover:bg-secondary/50 border-l-[3px]",
        )}
        style={{
          borderLeftColor: state ? STATE_ACCENT[state] : undefined,
          ...(hero ? { backgroundColor: "var(--state-happening-bg)" } : {}),
        }}
      >
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
                  {days} {days === 1 ? "day" : "days"}
                </span>
                <span className="text-muted-foreground/40" aria-hidden>
                  ·
                </span>
              </>
            )}
            <span className="flex items-center gap-1">
              <UsersIcon className="size-3 shrink-0" />
              {crewCount} {crewCount === 1 ? "member" : "members"}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
