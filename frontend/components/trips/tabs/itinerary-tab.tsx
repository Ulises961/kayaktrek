"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronDownIcon, ChevronUpIcon, MapIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createItinerary } from "@/lib/itinerary/actions"
import { totalDistanceNm, estimatedTime, formatTime } from "@/lib/itinerary/distance"
import type { Itinerary } from "@/lib/dtos/itinerary"
import type { Day } from "@/lib/dtos/day"
import type { Point } from "@/lib/dtos/point"

export interface ItineraryTabProps {
  tripId: string
  itinerary: Itinerary | null | undefined
  isLeader: boolean
  tripName?: string
}

const COLLAPSE_LIMIT = 5
const DEFAULT_SPEED  = 2.5

// ── Data helpers ──────────────────────────────────────────────────────────────

function walkDayPoints(day: Day): Point[] {
  const pts = day.points ?? []
  if (!day.startPointId || pts.length === 0) return []
  const map = new Map(pts.map((p) => [p.id!, p]))
  const ordered: Point[] = []
  let cur = map.get(day.startPointId)
  while (cur && ordered.length < 200) {
    ordered.push(cur)
    cur = cur.nextId ? map.get(cur.nextId) : undefined
  }
  return ordered
}

interface DayStats {
  isRestDay: boolean
  distanceNm: number
  startName: string | null
  endName: string | null
  hours: number
  minutes: number
}

function getDayStats(day: Day, speedKnots: number): DayStats {
  const pts = day.points ?? []
  if (!day.startPointId || pts.length === 0) {
    return { isRestDay: true, distanceNm: 0, startName: null, endName: null, hours: 0, minutes: 0 }
  }
  const ordered = walkDayPoints(day)
  const routePts = ordered
    .filter((p) => p.latitude != null && p.longitude != null)
    .map((p) => ({ latitude: p.latitude!, longitude: p.longitude! }))
  const distanceNm = totalDistanceNm(routePts)
  const { hours, minutes } = estimatedTime(distanceNm, speedKnots)
  const map = new Map(pts.map((p) => [p.id!, p]))
  const startName = map.get(day.startPointId!)?.name ?? null
  const endName   = day.endPointId ? (map.get(day.endPointId)?.name ?? null) : null
  return { isRestDay: false, distanceNm, startName, endName, hours, minutes }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground leading-none">
      {children}
    </span>
  )
}

function StatTile({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-lg font-semibold font-mono tabular-nums leading-none text-foreground truncate">
        {value}
      </span>{" "}
      <StatLabel>{label}</StatLabel>
    </div>
  )
}

function DayRow({ day, speedKnots }: { day: Day; speedKnots: number }) {
  const stats = getDayStats(day, speedKnots)
  const routeLabel =
    stats.startName && stats.endName && stats.endName !== stats.startName
      ? `${stats.startName} → ${stats.endName}`
      : stats.startName ?? ""

  return (
    <div className="py-2.5 border-l-2 border-border/50 pl-3 hover:border-primary/50 transition-colors">
      {/* Header row: day + date · metrics */}
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground shrink-0">
            Day {day.dayNumber}
          </span>
          {day.date && (
            <span className="text-[10px] text-muted-foreground/60 truncate">· {day.date}</span>
          )}
        </div>
        {!stats.isRestDay && stats.distanceNm > 0 && (
          <span className="text-[11px] font-mono tabular-nums text-muted-foreground shrink-0">
            {stats.distanceNm.toFixed(1)} nm · {formatTime({ hours: stats.hours, minutes: stats.minutes })}
          </span>
        )}
      </div>

      {/* Route or rest label */}
      <div className="mt-0.5">
        {stats.isRestDay ? (
          <span className="text-xs italic text-muted-foreground/70">Rest day</span>
        ) : routeLabel ? (
          <span className="text-sm text-foreground leading-snug">{routeLabel}</span>
        ) : day.date ? (
          <span className="text-sm text-muted-foreground leading-snug">{day.date}</span>
        ) : null}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ItineraryTab({ tripId, itinerary, isLeader, tripName }: ItineraryTabProps) {
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
      return <p className="text-sm text-muted-foreground italic">No itinerary yet.</p>
    }
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">Give the route a name to get started.</p>
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
  const days = (itinerary.days ?? []).filter((d) => d.dayNumber > 0)
  if (days.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Draft</span> — points dropped, no days assigned yet.
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
  const stopCount  = days.flatMap((d) => d.points ?? []).filter((p) => p.type === "stop").length
  const avgTime    = days.length > 0 && totalMiles > 0
    ? estimatedTime(totalMiles / days.length, speedKnots)
    : null

  const datesWithDate = days.filter((d) => d.date)
  const firstDate = datesWithDate[0]?.date
  const lastDate  = datesWithDate[datesWithDate.length - 1]?.date

  const visible = showAll ? days : days.slice(0, COLLAPSE_LIMIT)
  const hasMore = days.length > COLLAPSE_LIMIT

  return (
    <div className="flex flex-col gap-5">

      {/* Stats tiles */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <StatTile
          value={days.length}
          label={days.length === 1 ? "day" : "days"}
        />
        {totalMiles > 0 && (
          <StatTile value={`${totalMiles.toFixed(1)} nm`} label="total distance" />
        )}
        {avgTime && (
          <StatTile value={`~${formatTime(avgTime)}`} label="avg / day" />
        )}
        {stopCount > 0 && (
          <StatTile value={stopCount} label={stopCount === 1 ? "stop" : "stops"} />
        )}
      </div>

      {/* Date span */}
      {firstDate && lastDate && (
        <p className="text-xs text-muted-foreground -mt-2">
          {firstDate} → {lastDate}
        </p>
      )}

      {/* Day list */}
      <div className="flex flex-col gap-1.5">
        {visible.map((day) => (
          <DayRow key={day.id} day={day} speedKnots={speedKnots} />
        ))}
      </div>

      {/* Show all / less toggle */}
      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors self-start -mt-1"
        >
          {showAll ? (
            <><ChevronUpIcon className="size-3" />Show less</>
          ) : (
            <><ChevronDownIcon className="size-3" />Show all ({days.length - COLLAPSE_LIMIT} more)</>
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
