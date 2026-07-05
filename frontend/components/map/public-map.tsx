"use client"

import { Fragment, useEffect } from "react"
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import type { RouteData, RouteDaySegment, RoutePoint } from "@/lib/itinerary/public-routes"
import { ringIcon } from "@/components/map/ring-icon"

const MAX_FIT_ZOOM = 14

// Reserved for the M8 live-position feature (crew position broadcast while a trip
// is `happening`) — unused until then, so this component doesn't need a rewrite
// when that lands, only a new layer added alongside the static route.
export type LivePosition = {
  userId: string
  lat: number
  lon: number
  label?: string
}

type Props = {
  routes?: RouteData[]
  livePositions?: LivePosition[]
}

function stopNumber(points: RoutePoint[], index: number): number | undefined {
  if (points[index].type !== "stop") return undefined
  return points.slice(0, index + 1).filter((p) => p.type === "stop").length
}

// Points anchor the "real route" experience an outsider sees: the same ringIcon
// language as the authenticated builder (components/map/point-marker.tsx), coloured
// per day. Points with opted-in photos surface them in the popup — a thumbnail at
// the spot they were taken, not a separate disconnected gallery.
function DaySegmentMarkers({ routeId, segment }: { routeId: string; segment: RouteDaySegment }) {
  return (
    <>
      {segment.points.map((point, index) => (
        <Marker
          key={`${routeId}-${segment.dayNumber}-${index}`}
          position={[point.lat, point.lon]}
          icon={ringIcon(segment.color, point.type, stopNumber(segment.points, index))}
        >
          {(point.name || point.images.length > 0) && (
            <Popup>
              {point.name && <strong>{point.name}</strong>}
              {point.images.length > 0 && (
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

// Without this, the map sits at its fallback center/zoom regardless of where the
// route actually is — the day-coloured polylines/markers above still render
// correctly, just compressed into a handful of pixels at the wrong location.
function FitToRoutes({ routes }: { routes: RouteData[] }) {
  const map = useMap()
  useEffect(() => {
    const positions = routes.flatMap((route) => route.positions)
    if (positions.length === 0) return
    map.fitBounds(L.latLngBounds(positions), { padding: [48, 48], maxZoom: MAX_FIT_ZOOM })
  }, [map, routes])
  return null
}

export default function PublicMap({ routes = [] }: Props) {
  return (
    <MapContainer center={[43, 13]} zoom={5} className="h-full w-full" zoomControl={false}>
      <FitToRoutes routes={routes} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
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
            />
          ))}
        </Fragment>
      ))}
    </MapContainer>
  )
}
