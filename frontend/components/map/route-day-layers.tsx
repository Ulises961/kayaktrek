"use client"

import { Fragment } from "react"
import { Polyline, Marker, Popup } from "react-leaflet"
import type { RouteData, RouteDaySegment } from "@/lib/itinerary/public-routes"
import { ringIcon } from "@/components/map/ring-icon"

type DaySegmentMarkersProps = {
  routeId: string
  segment: RouteDaySegment
  showPhotos: boolean
}

// Points anchor the "real route" experience an outsider sees: the same ringIcon
// language as the authenticated builder (components/map/point-marker.tsx), coloured
// per day. Points with opted-in photos surface them in the popup when showPhotos is
// on — a thumbnail at the spot they were taken, not a separate disconnected gallery.
function DaySegmentMarkers({ routeId, segment, showPhotos }: DaySegmentMarkersProps) {
  return (
    <>
      {segment.points.map((point, index) => (
        <Marker
          key={`${routeId}-${segment.dayNumber}-${index}`}
          position={[point.lat, point.lon]}
          icon={ringIcon(segment.color, point.type, point.pointNumber ?? undefined)}
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
      ))}
    </>
  )
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
            segment.points.length < 2 ? null : (
              <Polyline
                key={`${route.id}-${segment.dayNumber}`}
                positions={segment.points.map((p): [number, number] => [p.lat, p.lon])}
                pathOptions={{ color: segment.color, weight: 3, opacity: 0.85 }}
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
          )}
          {route.days.map((segment) => (
            <DaySegmentMarkers
              key={`${route.id}-markers-${segment.dayNumber}`}
              routeId={route.id}
              segment={segment}
              showPhotos={showPhotos}
            />
          ))}
        </Fragment>
      ))}
    </>
  )
}
