"use client"

import { Fragment } from "react"
import { Polyline, Marker, Popup } from "react-leaflet"
import type { RouteData, RouteDaySegment, RoutePoint } from "@/lib/itinerary/public-routes"
import type { BoundaryColors } from "@/lib/itinerary/day-boundaries"
import { resolveLegDayNumber } from "@/lib/itinerary/day-boundaries"
import { getDayColor } from "@/lib/itinerary/colors"
import { ringIcon, splitRingIcon } from "@/components/map/ring-icon"

type DaySegmentMarkersProps = {
  routeId: string
  segment: RouteDaySegment
  boundaryColors: Record<string, BoundaryColors>
  showPhotos: boolean
}

// Points anchor the "real route" experience an outsider sees: the same ringIcon
// language as the authenticated builder (components/map/point-marker.tsx), coloured
// per day — and the same splitRingIcon at shared overnight-stop boundaries, so a
// multi-day route reads as day continuity rather than a hard colour break. Points
// with opted-in photos surface them in the popup when showPhotos is on — a
// thumbnail at the spot they were taken, not a separate disconnected gallery.
function DaySegmentMarkers({
  routeId,
  segment,
  boundaryColors,
  showPhotos,
}: DaySegmentMarkersProps) {
  return (
    <>
      {segment.points.map((point, index) => {
        const boundary = point.id ? boundaryColors[point.id] : undefined
        // A boundary stop appears in two adjacent day segments (end of day N-1,
        // start of day N). Render its split-ring marker once — from the segment
        // where it opens the day — and skip the duplicate closing occurrence.
        if (boundary && index === segment.points.length - 1) return null
        return (
          <Marker
            key={`${routeId}-${segment.dayNumber}-${index}`}
            position={[point.lat, point.lon]}
            icon={
              boundary
                ? splitRingIcon(boundary.left, boundary.right, point.pointNumber ?? undefined)
                : ringIcon(segment.color, point.type, point.pointNumber ?? undefined)
            }
          >
            {(point.name || (showPhotos && point.images.length > 0)) && (
              <Popup>
                {point.name && <strong>{point.name}</strong>}
                {showPhotos && point.images.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {point.images.map((image, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={image.url}
                        alt=""
                        className="h-16 w-16 rounded object-cover"
                      />
                    ))}
                  </div>
                )}
              </Popup>
            )}
          </Marker>
        )
      })}
    </>
  )
}

type ColorRun = {
  color: string
  positions: [number, number][]
}

// Splits a day's walked points into consecutive same-colour polyline runs,
// resolving each leg's colour through the same resolveLegDayNumber the builder's
// buildSegments uses (components/map/map-core.tsx). A day-opening boundary stop
// belongs to the previous day in the builder's single-owner storage model, so the
// leg leaving it resolves — via the boundary exception — to this day's colour.
function buildDayColorRuns(
  points: RoutePoint[],
  dayNumber: number,
  boundaryColors: Record<string, BoundaryColors>,
): ColorRun[] {
  const runs: ColorRun[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const aIsBoundary = a.id != null && boundaryColors[a.id] != null
    const dayNumA = i === 0 && aIsBoundary ? dayNumber - 1 : dayNumber
    const color = getDayColor(resolveLegDayNumber(dayNumA, dayNumber, aIsBoundary))
    const positions: [[number, number], [number, number]] = [
      [a.lat, a.lon],
      [points[i + 1].lat, points[i + 1].lon],
    ]
    const last = runs[runs.length - 1]
    if (last && last.color === color) {
      last.positions.push(positions[1])
    } else {
      runs.push({ color, positions })
    }
  }
  return runs
}

type RouteDayLayersProps = {
  routes: RouteData[]
  /** Detail-page richness only — a listing preview shows photos as clutter, not content. */
  showPhotos?: boolean
}

// Day-coloured polylines + point markers, shared by PublicMap (route detail /
// story pages) and ExploreDiscoveryMap's selected-route preview, so both speak
// the same visual language as the authenticated itinerary builder.
export function RouteDayLayers({ routes, showPhotos = true }: RouteDayLayersProps) {
  return (
    <>
      {routes.map((route) => (
        <Fragment key={route.id}>
          {route.days.map((segment) =>
            segment.points.length < 2
              ? null
              : buildDayColorRuns(segment.points, segment.dayNumber, route.boundaryColors).map(
                  (run, runIndex) => (
                    <Polyline
                      key={`${route.id}-${segment.dayNumber}-${runIndex}`}
                      positions={run.positions}
                      pathOptions={{ color: run.color, weight: 3, opacity: 0.85 }}
                    >
                      <Popup>
                        <strong>{route.name}</strong>
                        <div>
                          Day {segment.dayNumber}
                          {segment.date ? ` — ${segment.date}` : ""}
                        </div>
                      </Popup>
                    </Polyline>
                  ),
                ),
          )}
          {route.days.map((segment) => (
            <DaySegmentMarkers
              key={`${route.id}-markers-${segment.dayNumber}`}
              routeId={route.id}
              segment={segment}
              boundaryColors={route.boundaryColors}
              showPhotos={showPhotos}
            />
          ))}
        </Fragment>
      ))}
    </>
  )
}
