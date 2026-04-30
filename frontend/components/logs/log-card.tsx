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
        <span className="flex items-center gap-1.5 font-medium min-w-[90px]">
          <CalendarIcon className="size-4 text-muted-foreground shrink-0" />
          {date ?? <span className="text-muted-foreground">No date</span>}
        </span>

        {hours != null && (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <ClockIcon className="size-4 shrink-0" />
            {hours}h
          </span>
        )}

        {distance != null && (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <RouteIcon className="size-4 shrink-0" />
            {distance} km
          </span>
        )}

        {avgSea != null && <SeaStateChip value={avgSea} />}

        {log.id && (
          <Link href={`/logs/${log.id}/edit`} className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
            <PencilIcon className="size-4" />
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
