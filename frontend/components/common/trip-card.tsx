import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StateBadge } from "@/components/common/state-badge"
import { UsersIcon, CalendarIcon, ClockIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Trip, TripState } from "@/lib/dtos/trip"

interface TripCardProps {
  trip: Trip
  hero?: boolean
}

const STATE_ACCENT: Record<TripState, string> = {
  building:  "var(--state-planning-fg)",
  happening: "var(--state-happening-fg)",
  past:      "var(--state-past-fg)",
}

function daysBetween(from: string, to: string): number {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / msPerDay)
}

function formatDateRange(from: string, to: string): string {
  const f = new Date(from + "T12:00:00")
  const t = new Date(to + "T12:00:00")
  const sameYear = f.getFullYear() === t.getFullYear()
  const short = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  const full  = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  return sameYear ? `${short(f)} – ${full(t)}` : `${full(f)} – ${full(t)}`
}

export function TripCard({ trip, hero = false }: TripCardProps) {
  const { id, destination, state, dateFrom, dateTo, travellers } = trip
  const crewCount = travellers?.length ?? 0
  const days = dateFrom && dateTo ? daysBetween(dateFrom, dateTo) : null

  return (
    <Link href={`/trips/${id}`}>
      <Card
        className={cn(
          "transition-colors cursor-pointer",
          hero ? "border-l-[4px]" : "border-l-[3px] hover:bg-accent/50",
        )}
        style={{
          borderLeftColor: state ? STATE_ACCENT[state] : undefined,
          ...(hero ? { backgroundColor: "var(--state-happening-bg)" } : {}),
        }}
      >
        <CardHeader className="pb-1.5 pt-3 px-3">
          <div className="flex items-start justify-between gap-2 min-w-0">
            <CardTitle className={cn("font-semibold leading-snug truncate min-w-0", hero ? "text-base" : "text-sm")}>
              {destination ?? "Untitled trip"}
            </CardTitle>
            {state && <StateBadge state={state} className="shrink-0 self-start" />}
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0 space-y-0.5">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CalendarIcon className="size-3 shrink-0" />
            {dateFrom && dateTo ? (
              <span>{formatDateRange(dateFrom, dateTo)}</span>
            ) : (
              <span>No dates set</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {days !== null && (
              <>
                <span className="flex items-center gap-1">
                  <ClockIcon className="size-3 shrink-0" />
                  {days} {days === 1 ? "day" : "days"}
                </span>
                <span className="text-muted-foreground/40" aria-hidden>·</span>
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
