"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/common/user-avatar"
import { SeaStateChip } from "./sea-state-chip"
import { EndorseButton } from "./endorse-button"
import { AskToEndorsePicker } from "./ask-to-endorse-picker"
import { EditLogDialog } from "./edit-log-dialog"
import { DeleteLogButton } from "./delete-log-button"
import { CalendarIcon, ClockIcon, PencilIcon, RouteIcon, BadgeCheckIcon } from "lucide-react"
import { formatDayDate } from "@/lib/utils/date"
import { DISTANCE_UNIT, toNm, type DistanceUnit } from "@/lib/itinerary/distance"
import type { Log } from "@/lib/dtos/log"

interface LogCardProps {
  log: Log
  /**
   * "owner" (default) — the viewer's own log: edit/delete affordances, endorsements shown read-only.
   * "endorsed" — a log the viewer has endorsed (foreign): withdraw affordance, no edit/delete.
   */
  variant?: "owner" | "endorsed"
  /** The viewer's id — enables the "ask to endorse" picker on owned trip-linked logs. */
  currentUserId?: string
  unit?: DistanceUnit
}

const MAX_AVATARS = 5

export function LogCard({
  log,
  variant = "owner",
  currentUserId,
  unit = DISTANCE_UNIT.KM,
}: LogCardProps) {
  const [editOpen, setEditOpen] = useState(false)
  const { date, hours, distance, avgSea } = log
  const displayDistance = distance != null && unit === DISTANCE_UNIT.NM ? toNm(distance) : distance
  const endorsers = log.endorsers ?? []
  const count = log.endorsementCount ?? endorsers.length
  const canAskToEndorse = variant === "owner" && currentUserId && log.id && log.tripId
  const isOwner = variant === "owner" && log.id

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="flex min-w-[90px] items-center gap-1.5 font-medium">
            <CalendarIcon className="text-muted-foreground size-4 shrink-0" />
            {date ? formatDayDate(date) : <span className="text-muted-foreground">No date</span>}
          </span>

          {hours != null && (
            <span className="text-muted-foreground flex items-center gap-1.5">
              <ClockIcon className="size-4 shrink-0" />
              {hours}h
            </span>
          )}

          {displayDistance != null && (
            <span className="text-muted-foreground flex items-center gap-1.5">
              <RouteIcon className="size-4 shrink-0" />
              {displayDistance.toFixed(1)} {unit}
            </span>
          )}

          {avgSea != null && <SeaStateChip value={avgSea} />}

          {variant === "endorsed" && log.id ? (
            <span className="ml-auto">
              <EndorseButton logId={log.id} endorsed />
            </span>
          ) : (
            isOwner && (
              <span className="ml-auto flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Edit log"
                  className="text-muted-foreground hover:text-foreground size-7"
                  onClick={() => setEditOpen(true)}
                >
                  <PencilIcon className="size-3.5" />
                </Button>
                <DeleteLogButton logId={log.id!} />
              </span>
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

        {canAskToEndorse && (
          <div className="flex justify-end">
            <AskToEndorsePicker
              logId={log.id!}
              tripId={log.tripId!}
              authorId={currentUserId!}
              endorserIds={endorsers.map((endorser) => endorser.id)}
            />
          </div>
        )}
      </CardContent>

      {isOwner && (
        <EditLogDialog log={log} unit={unit} open={editOpen} onOpenChange={setEditOpen} />
      )}
    </Card>
  )
}
