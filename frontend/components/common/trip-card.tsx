import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StateBadge } from "@/components/common/state-badge"
import { UsersIcon, CalendarIcon, ClockIcon } from "lucide-react"
import type { Trip } from "@/lib/dtos/trip"

interface TripCardProps {
  trip: Trip
}

function daysBetween(from: string, to: string): number {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / msPerDay)
}

export function TripCard({ trip }: TripCardProps) {
  const { id, destination, state, dateFrom, dateTo, travellers } = trip
  const crewCount = travellers?.length ?? 0
  const days = dateFrom && dateTo ? daysBetween(dateFrom, dateTo) : null

  return (
    <Link href={`/trips/${id}`}>
      <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base">{destination ?? "Untitled trip"}</CardTitle>
            {state && <StateBadge state={state} />}
          </div>
        </CardHeader>
        <CardContent className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarIcon className="size-3.5" />
            {dateFrom && dateTo ? (
              <>{dateFrom} — {dateTo}</>
            ) : (
              "No dates set"
            )}
          </span>
          {days !== null && (
            <span className="flex items-center gap-1">
              <ClockIcon className="size-3.5" />
              {days} days
            </span>
          )}
          <span className="flex items-center gap-1">
            <UsersIcon className="size-3.5" />
            {crewCount} {crewCount === 1 ? "member" : "members"}
          </span>
        </CardContent>
      </Card>
    </Link>
  )
}
