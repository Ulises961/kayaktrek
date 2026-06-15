import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { SeaStateChip } from "./sea-state-chip"
import { CalendarIcon, ClockIcon, PencilIcon, RouteIcon } from "lucide-react"
import type { Log } from "@/lib/dtos/log"

interface LogCardProps {
  log: Log
}

export function LogCard({ log }: LogCardProps) {
  const { date, hours, distance, avgSea } = log

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4 py-3 text-sm">
        <span className="flex min-w-[90px] items-center gap-1.5 font-medium">
          <CalendarIcon className="text-muted-foreground size-4 shrink-0" />
          {date ?? <span className="text-muted-foreground">No date</span>}
        </span>

        {hours != null && (
          <span className="text-muted-foreground flex items-center gap-1.5">
            <ClockIcon className="size-4 shrink-0" />
            {hours}h
          </span>
        )}

        {distance != null && (
          <span className="text-muted-foreground flex items-center gap-1.5">
            <RouteIcon className="size-4 shrink-0" />
            {distance} km
          </span>
        )}

        {avgSea != null && <SeaStateChip value={avgSea} />}

        {log.id && (
          <Link
            href={`/logs/${log.id}/edit`}
            className="text-muted-foreground hover:text-foreground ml-auto transition-colors"
          >
            <PencilIcon className="size-4" />
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
