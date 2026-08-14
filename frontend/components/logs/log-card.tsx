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
  const hasActions = Boolean(isOwner || canAskToEndorse || (variant === "endorsed" && log.id))

  return (
    <Card>
      {/* Two columns from `sm`, one below it. The body (metrics, endorsements) and the
          actions are siblings of one flex container, so the same markup puts the action
          group beside the metrics on a wide card and stacks it into a section of its own
          on a narrow one. */}
      <CardContent className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* xs at base: the root is 112.5%, so `text-sm` still renders ~16px and a date,
              hours, distance and a sea chip do not fit a 320px row. `min-h-8` from `sm`
              matches the action buttons' height, so the two columns start on one line
              instead of the buttons hanging below the text. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs sm:min-h-8 sm:gap-4 sm:text-sm">
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
        </div>

        {/* Every action the card offers, reading left to right: edit, delete,
            endorsement. One row at base, under a rule, because a 320px card has no room
            for them beside the metrics. From `sm` the group turns vertical against the
            card's right edge, which puts edit and delete on the metrics line and leaves
            the line below to the endorsement control — a labelled button, sized quite
            differently from two 32px glyphs. */}
        {hasActions && (
          <div className="border-border flex flex-wrap items-center gap-1 border-t pt-2 sm:shrink-0 sm:flex-col sm:items-end sm:gap-2 sm:border-t-0 sm:pt-0">
            {isOwner && (
              <span className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Edit log"
                  className="text-muted-foreground hover:text-foreground size-8"
                  onClick={() => setEditOpen(true)}
                >
                  <PencilIcon className="size-4" />
                </Button>
                <DeleteLogButton logId={log.id!} />
              </span>
            )}
            {canAskToEndorse && (
              <AskToEndorsePicker
                logId={log.id!}
                tripId={log.tripId!}
                authorId={currentUserId!}
                endorserIds={endorsers.map((endorser) => endorser.id)}
              />
            )}
            {variant === "endorsed" && log.id && <EndorseButton logId={log.id} endorsed />}
          </div>
        )}
      </CardContent>

      {isOwner && (
        <EditLogDialog log={log} unit={unit} open={editOpen} onOpenChange={setEditOpen} />
      )}
    </Card>
  )
}
