"use client"
import { Fragment, useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { useMapBuilder } from "@/lib/itinerary/map-builder-context"
import { fetchDayWeather } from "@/lib/weather/actions"
import { representativeHour } from "@/lib/weather/hourly"
import { formatDayDate } from "@/lib/utils/date"
import { formatDateRange } from "@/lib/trips/format"
import { getDayColor } from "@/lib/itinerary/colors"
import { walkDayRoutePoints } from "@/lib/itinerary/day-points"
import { computeRestGaps, type RestGap } from "@/lib/itinerary/format"
import { BeaufortPill } from "@/components/weather/beaufort-pill"
import type { Weather } from "@/lib/dtos/weather"
import type { Day } from "@/lib/dtos/day"

type DayRailEntryProps = {
  day: Day
  isActive: boolean
  pointCount: number
  conditionsVersion: number
  onClick: () => void
}

function DayRailEntry({
  day,
  isActive,
  pointCount,
  conditionsVersion,
  onClick,
}: DayRailEntryProps) {
  const [weather, setWeather] = useState<Weather | null>(null)
  const isEmpty = pointCount === 0

  useEffect(() => {
    if (isEmpty) return
    let active = true
    fetchDayWeather(day.id!).then((r) => {
      if (active && r.success) setWeather(r.data)
    })
    return () => {
      active = false
    }
  }, [day.id, isEmpty, conditionsVersion])

  const windState = representativeHour(weather?.weatherStates)
  const hasWind = windState != null && windState.windForce != null

  const placeholderColor = isActive ? "text-primary-foreground/60" : "text-muted-foreground/70"

  return (
    <button
      type="button"
      data-testid="day-rail-entry"
      data-selected={isActive ? "true" : undefined}
      data-empty={isEmpty ? "true" : undefined}
      disabled={isEmpty}
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-0.5 rounded-lg px-2 py-2 text-left text-xs transition-colors",
        isEmpty && "cursor-default opacity-50",
        isActive
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-foreground enabled:hover:bg-muted/60",
      )}
    >
      <span className="flex items-center gap-1.5 font-semibold">
        <span
          data-testid="day-color-swatch"
          className="h-4 w-1 shrink-0 rounded-sm"
          style={{ backgroundColor: getDayColor(day.dayNumber) }}
        />
        Day {day.dayNumber}
      </span>
      <span
        className={cn(
          "text-[10px]",
          day.date
            ? isActive
              ? "text-primary-foreground/80"
              : "text-muted-foreground"
            : cn("italic", placeholderColor),
        )}
      >
        {day.date ? formatDayDate(day.date) : "Add date"}
      </span>
      <div className="flex items-center gap-1 pt-0.5">
        {hasWind ? (
          <BeaufortPill knots={windState!.windForce!} direction={windState!.windDirection} />
        ) : (
          <span className={cn("text-[10px] italic", placeholderColor)}>
            {isEmpty ? "No points" : "No forecast"}
          </span>
        )}
      </div>
      {!isEmpty && (
        <span
          className={cn(
            "text-[10px]",
            isActive ? "text-primary-foreground/60" : "text-muted-foreground",
          )}
        >
          {pointCount} pt{pointCount !== 1 ? "s" : ""}
        </span>
      )}
    </button>
  )
}

// A purely visual placeholder for a calendar-date gap between two dated real
// days — never a real Day entity, never clickable. Same vocabulary as a
// disabled/empty DayRailEntry, deliberately not a <button>.
function RestGapEntry({ gaps }: { gaps: RestGap[] }) {
  const first = gaps[0].date
  const last = gaps[gaps.length - 1].date
  const label = first === last ? formatDayDate(first) : formatDateRange(first, last)

  return (
    <div
      data-testid="rest-gap-entry"
      className="text-muted-foreground/70 flex w-full flex-col gap-0.5 rounded-lg px-2 py-2 text-left text-xs"
    >
      <span className="font-semibold italic">Rest</span>
      <span className="text-[10px]">{label}</span>
    </div>
  )
}

export function DayRail() {
  const { state, tripName, selectedDayId, setSelectedDayId, conditionsVersion } = useMapBuilder()

  // A day's own route may include a boundary stop shared with (and stored
  // under) the adjacent day — walk by boundary id through the *global* point
  // map instead of grouping by `dayId`, falling back to that grouping only
  // for a day with no boundary metadata yet.
  const pointsById = new Map(state.points.filter((p) => p.id).map((p) => [p.id!, p]))
  const pointCountByDay = new Map<string, number>()
  for (const day of state.days) {
    if (!day.id) continue
    const fallback = state.points.filter((p) => p.dayId === day.id)
    pointCountByDay.set(day.id, walkDayRoutePoints(day, pointsById, fallback).length)
  }

  const numberedDays = [...state.days]
    .filter((d) => d.dayNumber > 0)
    .sort((a, b) => a.dayNumber - b.dayNumber)

  const gapsByAfterDayNumber = new Map<number, RestGap[]>()
  for (const gap of computeRestGaps(numberedDays)) {
    const list = gapsByAfterDayNumber.get(gap.afterDayNumber) ?? []
    list.push(gap)
    gapsByAfterDayNumber.set(gap.afterDayNumber, list)
  }

  return (
    <div
      data-testid="day-rail"
      className="border-border bg-background/90 z-[1001] flex w-28 shrink-0 flex-col overflow-y-auto border-r backdrop-blur-sm"
    >
      {/* Strip header */}
      <div className="border-border/40 shrink-0 border-b px-2.5 py-2.5">
        <p className="text-muted-foreground truncate text-[9px] font-bold tracking-widest uppercase">
          {tripName || "Itinerary"}
        </p>
        <p className="text-muted-foreground mt-0.5 text-[10px]">
          {numberedDays.length} day{numberedDays.length !== 1 ? "s" : ""}
        </p>
      </div>

      {numberedDays.length === 0 ? (
        <p className="text-muted-foreground px-2.5 py-4 text-center text-[10px]">No days planned</p>
      ) : (
        <div className="flex flex-col gap-0.5 p-1.5">
          {numberedDays.map((day) => {
            const gaps = gapsByAfterDayNumber.get(day.dayNumber)
            return (
              <Fragment key={day.id}>
                <DayRailEntry
                  day={day}
                  isActive={selectedDayId === day.id}
                  pointCount={pointCountByDay.get(day.id!) ?? 0}
                  conditionsVersion={conditionsVersion}
                  onClick={() => setSelectedDayId(selectedDayId === day.id ? null : day.id!)}
                />
                {gaps && <RestGapEntry gaps={gaps} />}
              </Fragment>
            )
          })}
        </div>
      )}
    </div>
  )
}
