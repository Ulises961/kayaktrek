"use client"

import { useState } from "react"
import { formatDayDate } from "@/lib/utils/date"
import {
  DISTANCE_UNIT,
  formatDistance,
  legLabel,
  groupStopsWithVia,
  type DistanceUnit,
} from "@/lib/itinerary/distance"
import { POINT_TYPE } from "@/lib/dtos/point"
import { railConnectorClass, RailTypeIcon, ViaDots } from "@/components/common/route-rail"
import type { RouteDaySegment, RoutePoint } from "@/lib/itinerary/public-routes"

// `routeLegs`/`groupStopsWithVia` key on `latitude`/`longitude` (the authenticated
// builder's own field names) — `RoutePoint` carries the same coordinates as `lat`/`lon`
// (M19's public shape). Spreading keeps `name`/`pointNumber`/`type` on the leg's
// `point` rather than only the coordinates a lookup-by-id would otherwise require.
function withCoords(p: RoutePoint) {
  return { ...p, latitude: p.lat, longitude: p.lon }
}

// Distance alone when there's no planning speed to estimate time from — an older
// route may never have had `avgSpeedKnots` set, and `legLabel` divides by it.
function legText(nm: number, avgSpeedKnots: number | null | undefined, unit: DistanceUnit) {
  if (avgSpeedKnots != null) return legLabel(nm, avgSpeedKnots, unit)
  return `${formatDistance(nm, unit)} ${unit}`
}

/**
 * Per-day mileage breakdown for the public route detail page, stop-to-stop within
 * each day — the same leg model the authenticated builder's Route tab uses
 * (`docs/adr/itinerary-frontend.md`, "Paddle-time legs"). Positions (pass-through
 * geometry) stay collapsed into their stop's leg by default and expand on request,
 * so a visitor can see the shape of a day — not just its total — before choosing to
 * use the route.
 */
export function RouteDayBreakdown({
  days,
  avgSpeedKnots,
  unit = DISTANCE_UNIT.NM,
}: {
  days: RouteDaySegment[]
  avgSpeedKnots?: number | null
  unit?: DistanceUnit
}) {
  // Keyed by the arriving stop's point id — several can be open at once, across days.
  const [openVia, setOpenVia] = useState<Set<string>>(new Set())

  if (days.length === 0) return null

  function toggleVia(pointId: string) {
    setOpenVia((prev) => {
      const next = new Set(prev)
      if (next.has(pointId)) next.delete(pointId)
      else next.add(pointId)
      return next
    })
  }

  return (
    // Sized by what the panel has left rather than by a fixed cap. `min-h-0` is what
    // lets the list be the part that gives way when the panel is short — without it
    // a flex item refuses to shrink below its content and the scroll never engages.
    <div className="border-border flex min-h-0 flex-col gap-1 border-t pt-3">
      <p className="text-muted-foreground shrink-0 text-xs font-medium tracking-wide uppercase">
        Daily breakdown
      </p>
      <div className="divide-border/50 min-h-0 divide-y overflow-y-auto">
        {days.map((day) => {
          const stops = groupStopsWithVia(day.points.map(withCoords))
          return (
            <div key={day.dayNumber} className="py-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">Day {day.dayNumber}</span>
                {day.date && (
                  <span className="text-muted-foreground flex-1">{formatDayDate(day.date)}</span>
                )}
                <span className="text-muted-foreground tabular-nums">
                  {formatDistance(day.distanceNm, unit)} {unit}
                </span>
              </div>
              {stops.length > 1 && (
                <div className="mt-1 flex flex-col">
                  {stops.map((stop, i) => {
                    const stopId = stop.point.id ?? ""
                    const isOpen = openVia.has(stopId)
                    // A dashed rail segment means positions were aggregated into the
                    // leg it spans; solid means the two stops are adjacent. Same
                    // convention as the authenticated builder's Route tab.
                    const topDashed = stop.via.length > 0
                    const bottomDashed = (stops[i + 1]?.via.length ?? 0) > 0
                    const isLastRow = i === stops.length - 1
                    return (
                      <div key={stopId}>
                        {/* Rendered before the stop it leads to, matching the order the
                            positions are actually paddled in — the toggle for "2 and 3"
                            belongs between "1" and "4", not after "4". The rail carries
                            its own glyphs — one small dot per aggregated position,
                            capped so a long crossing doesn't stretch the rail — rather
                            than a chevron or a count in words: the rail itself reads
                            anchor — waypoint(s) — anchor. Exact count and names are
                            still there, in the expanded rows below and in the
                            aria-label, for whoever the dots' own count doesn't reach. */}
                        {stop.via.length > 0 && (
                          <button
                            type="button"
                            data-testid="day-breakdown-via-toggle"
                            aria-expanded={isOpen}
                            aria-label={`${stop.via.length} waypoint${stop.via.length === 1 ? "" : "s"} along the way`}
                            onClick={() => toggleVia(stopId)}
                            className="hover:bg-muted/40 flex w-4 shrink-0 flex-col items-center py-0.5 transition-colors"
                          >
                            <span className="border-border w-0 flex-1 border-l border-dashed" />
                            <ViaDots count={stop.via.length} />
                            <span className="border-border w-0 flex-1 border-l border-dashed" />
                          </button>
                        )}
                        {isOpen && (
                          <ul className="flex flex-col gap-0.5 pb-0.5">
                            {stop.via.map((leg) => (
                              <li
                                key={leg.point.id}
                                data-testid="day-breakdown-via"
                                className="text-muted-foreground flex items-baseline gap-1.5 pl-[1.375rem] text-[10px]"
                              >
                                <span className="min-w-0 flex-1 truncate">
                                  {leg.point.name || `Point ${leg.point.pointNumber ?? ""}`}
                                </span>
                                <span className="shrink-0 font-mono tabular-nums">
                                  {legText(leg.legNm, avgSpeedKnots, unit)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="flex items-stretch gap-1.5 py-0.5 text-xs">
                          <div className="relative flex w-4 shrink-0 flex-col items-center self-stretch">
                            <span
                              aria-hidden
                              className={railConnectorClass(
                                topDashed,
                                i === 0 || stop.via.length > 0,
                              )}
                            />
                            <span className="bg-background z-10 my-0.5 flex">
                              <RailTypeIcon
                                type={stop.point.type ?? POINT_TYPE.POSITION}
                                className="size-3"
                              />
                            </span>
                            <span
                              aria-hidden
                              className={railConnectorClass(bottomDashed, isLastRow)}
                            />
                          </div>
                          <span className="min-w-0 flex-1 truncate">
                            {stop.point.name || `Point ${stop.point.pointNumber ?? ""}`}
                          </span>
                          {!stop.isStart && (
                            <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
                              {legText(stop.legNm, avgSpeedKnots, unit)}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
