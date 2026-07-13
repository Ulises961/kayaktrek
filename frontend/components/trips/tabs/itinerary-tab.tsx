"use client"

import { Fragment, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronDownIcon, ChevronUpIcon, MapIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createItinerary } from "@/lib/itinerary/actions"
import { totalDistanceNm, estimatedTime, formatTime } from "@/lib/itinerary/distance"
import { formatRouteRange, computeRestGaps, type RestGap } from "@/lib/itinerary/format"
import { walkDayRoutePoints } from "@/lib/itinerary/day-points"
import { formatDayDate } from "@/lib/utils/date"
import { daysBetween, formatDateRange } from "@/lib/trips/format"
import type { Itinerary } from "@/lib/dtos/itinerary"
import type { Day } from "@/lib/dtos/day"
import { POINT_TYPE, type Point } from "@/lib/dtos/point"

export interface ItineraryTabProps {
  tripId: string
  itinerary: Itinerary | null | undefined
  isLeader: boolean
  tripName?: string
  /** Trip's own inclusive date span — the denominator for "X of Y days routed". */
  dateFrom?: string | null
  dateTo?: string | null
}

const COLLAPSE_LIMIT = 5
const DEFAULT_SPEED = 2.5

// ── Data helpers ──────────────────────────────────────────────────────────────

interface DayStats {
  isRestDay: boolean
  distanceNm: number
  startName: string | null
  endName: string | null
  hours: number
  minutes: number
}

// `pointsById` must span every day's points, not just this one — single-owner
// storage means the stop shared with the adjacent day may live in that day's
// own `points` array instead of this one (see `walkDayRoutePoints`).
function getDayStats(day: Day, speedKnots: number, pointsById: Map<string, Point>): DayStats {
  const ordered = walkDayRoutePoints(day, pointsById, day.points ?? [])
  if (ordered.length <= 1) {
    return { isRestDay: true, distanceNm: 0, startName: null, endName: null, hours: 0, minutes: 0 }
  }
  const routePts = ordered
    .filter((p) => p.latitude != null && p.longitude != null)
    .map((p) => ({ latitude: p.latitude!, longitude: p.longitude! }))
  const distanceNm = totalDistanceNm(routePts)
  const { hours, minutes } = estimatedTime(distanceNm, speedKnots)
  const startName = ordered[0]?.name ?? null
  const endName = ordered[ordered.length - 1]?.name ?? null
  return { isRestDay: false, distanceNm, startName, endName, hours, minutes }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-muted-foreground text-[10px] leading-none font-semibold tracking-[0.08em] uppercase">
      {children}
    </span>
  )
}

function StatTile({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-foreground truncate font-mono text-sm leading-none font-medium tabular-nums">
        {value}
      </span>{" "}
      <StatLabel>{label}</StatLabel>
    </div>
  )
}

function DayRow({
  day,
  speedKnots,
  pointsById,
}: {
  day: Day
  speedKnots: number
  pointsById: Map<string, Point>
}) {
  const stats = getDayStats(day, speedKnots, pointsById)
  const routeLabel = formatRouteRange(stats.startName, stats.endName)

  return (
    <div className="border-border/50 hover:border-primary/50 border-l-2 py-2.5 pl-3 transition-colors">
      {/* Header row: day + date · metrics */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="text-muted-foreground shrink-0 text-[10px] font-semibold tracking-[0.06em] uppercase">
            Day {day.dayNumber}
          </span>
          {day.date && (
            <span className="text-muted-foreground/60 truncate text-[10px]">
              · {formatDayDate(day.date)}
            </span>
          )}
        </div>
        {!stats.isRestDay && stats.distanceNm > 0 && (
          <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">
            {stats.distanceNm.toFixed(1)} nm ·{" "}
            {formatTime({ hours: stats.hours, minutes: stats.minutes })}
          </span>
        )}
      </div>

      {/* Route or rest label */}
      <div className="mt-0.5">
        {stats.isRestDay ? (
          <span className="text-muted-foreground/70 text-xs italic">Rest day</span>
        ) : routeLabel ? (
          <span className="text-foreground text-sm leading-snug">{routeLabel}</span>
        ) : day.date ? (
          <span className="text-muted-foreground text-sm leading-snug">
            {formatDayDate(day.date)}
          </span>
        ) : null}
      </div>
    </div>
  )
}

// A purely visual placeholder for a calendar-date gap between two dated real
// days — never a real Day entity. Same "Rest day" vocabulary as an empty-slice
// DayRow, but its own row since it has no dayNumber of its own.
function RestGapRow({ gaps }: { gaps: RestGap[] }) {
  const first = gaps[0].date
  const last = gaps[gaps.length - 1].date
  const label = first === last ? formatDayDate(first) : formatDateRange(first, last)

  return (
    <div
      data-testid="rest-gap-entry"
      className="border-border/30 py-2.5 pl-3 text-xs"
      style={{ borderLeftWidth: 2 }}
    >
      <span className="text-muted-foreground/60 text-[10px] font-semibold tracking-[0.06em] uppercase">
        {label}
      </span>
      <div className="mt-0.5">
        <span className="text-muted-foreground/70 text-xs italic">Rest</span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ItineraryTab({
  tripId,
  itinerary,
  isLeader,
  tripName,
  dateFrom,
  dateTo,
}: ItineraryTabProps) {
  const [isPending, startTransition] = useTransition()
  const [showAll, setShowAll] = useState(false)
  const [name, setName] = useState(tripName ?? "")
  const router = useRouter()

  function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) return
    startTransition(async () => {
      const result = await createItinerary({ tripId, name: trimmed })
      if (result.success) router.push(`/itinerary/${result.itineraryId}`)
    })
  }

  // ── No itinerary ──────────────────────────────────────────────────────────
  if (!itinerary) {
    if (!isLeader) {
      return <p className="text-muted-foreground text-sm italic">No itinerary yet.</p>
    }
    return (
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-xs">Give the route a name to get started.</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            placeholder="e.g. Galician Coast southbound"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="sm:max-w-xs"
          />
          <Button
            size="sm"
            disabled={isPending || !name.trim()}
            onClick={handleCreate}
            className="shrink-0"
          >
            <MapIcon className="size-4" />
            Create itinerary
          </Button>
        </div>
      </div>
    )
  }

  // ── Draft (no numbered days) ───────────────────────────────────────────────
  const days = (itinerary.days ?? [])
    .filter((d) => d.dayNumber > 0)
    .sort((a, b) => a.dayNumber - b.dayNumber)
  if (days.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          <span className="text-foreground font-medium">Draft</span> — points dropped, no days
          assigned yet.
        </p>
        <Button asChild size="sm" className="self-start">
          <Link href={`/itinerary/${itinerary.id}`}>
            <MapIcon className="size-4" />
            Open itinerary
          </Link>
        </Button>
      </div>
    )
  }

  // ── Full summary ──────────────────────────────────────────────────────────
  const speedKnots = itinerary.avgSpeedKnots ?? DEFAULT_SPEED
  const totalMiles = itinerary.totalMiles ?? 0
  const allPoints = days.flatMap((d) => d.points ?? [])
  const pointsById = new Map(allPoints.filter((p) => p.id).map((p) => [p.id!, p]))
  const stopCount = allPoints.filter((p) => p.type === POINT_TYPE.STOP).length
  const avgTime =
    days.length > 0 && totalMiles > 0 ? estimatedTime(totalMiles / days.length, speedKnots) : null

  const datesWithDate = days.filter((d) => d.date)
  const firstDate = datesWithDate[0]?.date
  const lastDate = datesWithDate[datesWithDate.length - 1]?.date

  const visible = showAll ? days : days.slice(0, COLLAPSE_LIMIT)
  const hasMore = days.length > COLLAPSE_LIMIT

  // The trip's inclusive calendar span is the "how many days is this trip" total
  // (matches the trip header / trips list, review 2.2) — itinerary.days only holds
  // the days a Day entity was ever created for, so a calendar date the paddler never
  // opened the builder for (a skipped day, not even an explicit empty-slice rest day)
  // is absent from that array entirely. Counting the denominator off the calendar
  // span rather than `days.length` means those un-modeled gaps still count against
  // the total instead of silently vanishing.
  const routedDaysCount = days.filter((d) => (d.points ?? []).length > 0).length
  const totalTripDays = dateFrom && dateTo ? daysBetween(dateFrom, dateTo) : null

  const gapsByAfterDayNumber = new Map<number, RestGap[]>()
  for (const gap of computeRestGaps(days)) {
    const list = gapsByAfterDayNumber.get(gap.afterDayNumber) ?? []
    list.push(gap)
    gapsByAfterDayNumber.set(gap.afterDayNumber, list)
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Stats tiles */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        {totalTripDays != null ? (
          <StatTile value={`${routedDaysCount} of ${totalTripDays}`} label="days routed" />
        ) : (
          <StatTile value={days.length} label={days.length === 1 ? "day" : "days"} />
        )}
        {totalMiles > 0 && (
          <StatTile value={`${totalMiles.toFixed(1)} nm`} label="total distance" />
        )}
        {avgTime && <StatTile value={`~${formatTime(avgTime)}`} label="avg / day" />}
        {stopCount > 0 && <StatTile value={stopCount} label={stopCount === 1 ? "stop" : "stops"} />}
      </div>

      {/* Date span */}
      {firstDate && lastDate && (
        <p className="text-muted-foreground -mt-2 text-xs">
          {formatDateRange(firstDate, lastDate)}
        </p>
      )}

      {/* Day list */}
      <div className="flex flex-col gap-1.5">
        {visible.map((day) => {
          const gaps = gapsByAfterDayNumber.get(day.dayNumber)
          return (
            <Fragment key={day.id}>
              <DayRow day={day} speedKnots={speedKnots} pointsById={pointsById} />
              {gaps && <RestGapRow gaps={gaps} />}
            </Fragment>
          )
        })}
      </div>

      {/* Show all / less toggle */}
      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-muted-foreground hover:text-foreground -mt-1 flex items-center gap-1 self-start text-xs transition-colors"
        >
          {showAll ? (
            <>
              <ChevronUpIcon className="size-3" />
              Show less
            </>
          ) : (
            <>
              <ChevronDownIcon className="size-3" />
              Show all ({days.length - COLLAPSE_LIMIT} more)
            </>
          )}
        </button>
      )}

      {/* Primary CTA */}
      <Button asChild size="sm" className="self-start">
        <Link href={`/itinerary/${itinerary.id}`}>
          <MapIcon className="size-4" />
          Open itinerary →
        </Link>
      </Button>
    </div>
  )
}
