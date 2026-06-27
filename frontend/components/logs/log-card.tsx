import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { UserAvatar } from "@/components/common/user-avatar"
import { SeaStateChip } from "./sea-state-chip"
import { EndorseButton } from "./endorse-button"
import { CalendarIcon, ClockIcon, PencilIcon, RouteIcon, BadgeCheckIcon } from "lucide-react"
import type { Log } from "@/lib/dtos/log"

interface LogCardProps {
  log: Log
  /**
   * "owner" (default) — the viewer's own log: edit affordance, endorsements shown read-only.
   * "endorsed" — a log the viewer has endorsed (foreign): withdraw affordance, no edit.
   */
  variant?: "owner" | "endorsed"
}

const MAX_AVATARS = 5

export function LogCard({ log, variant = "owner" }: LogCardProps) {
  const { date, hours, distance, avgSea } = log
  const endorsers = log.endorsers ?? []
  const count = log.endorsementCount ?? endorsers.length

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
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

          {variant === "endorsed" && log.id ? (
            <span className="ml-auto">
              <EndorseButton logId={log.id} endorsed />
            </span>
          ) : (
            log.id && (
              <Link
                href={`/logs/${log.id}/edit`}
                aria-label="Edit log"
                className="text-muted-foreground hover:text-foreground ml-auto transition-colors"
              >
                <PencilIcon className="size-4" />
              </Link>
            )
          )}
        </div>

        {/* Endorsements received */}
        {count > 0 && (
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <BadgeCheckIcon className="size-3.5 shrink-0" />
            <span>
              {count} endorsement{count === 1 ? "" : "s"}
            </span>
            {endorsers.length > 0 && (
              <span className="flex -space-x-1.5">
                {endorsers.slice(0, MAX_AVATARS).map((endorser) => (
                  <UserAvatar
                    key={endorser.id}
                    name={endorser.name}
                    imageUrl={endorser.avatarUrl}
                    size="sm"
                    className="ring-background !size-5 ring-2"
                  />
                ))}
              </span>
            )}
            {endorsers.length > MAX_AVATARS && <span>+{endorsers.length - MAX_AVATARS}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
