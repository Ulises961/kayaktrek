"use client"

import { Fragment, useEffect } from "react"
import { MapContainer, TileLayer, Polyline, Marker, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { ringIcon } from "@/components/map/ring-icon"
import {
  Graticule,
  ScaleBar,
  ForecastCell,
  CHART_INK as INK,
  CHART_DEEP as DEEP,
  CHART_PAPER as PAPER,
} from "@/components/map/chart"
import type { RouteData } from "@/lib/itinerary/public-routes"
import { palette } from "@/lib/tokens"

// "hero" is the full landing chart (all instruments). "banner" is the calmer
// dashboard bridge — basemap + graticule + route only, no forecast cell or scale
// bar, framed tight to fill a slim strip. The landing stays the bold hero; the
// dashboard is a quiet continuation of the same chart.
type Variant = "hero" | "banner"

type Props = {
  routes?: RouteData[]
  center?: [number, number]
  zoom?: number
  // When false the map is a static poster (no drag/zoom) so page-scroll is never
  // captured — used on mobile, where touch-drag would fight the scroll-dissipate.
  interactive?: boolean
  variant?: Variant
}

// Esri Ocean Basemap — soft bathymetric Mediterranean blue, water-forward.
const ESRI_OCEAN =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}"
const SEAMARK = "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"

// Zoom is locked to Esri Ocean's useful range for this region: it thins to
// "no data" past ~z11, and the landing is a calm discovery chart, not the
// route-detail planner (which uses OSM). Locking keeps the chart aesthetic
// intact rather than swapping to a busy street basemap mid-interaction.
const MIN_ZOOM = 6
const MAX_ZOOM = 10

// Route markers reusing the planner's shared ringIcon, so the landing speaks the
// same marker language as the builder. Overnight stops get a sequential number in
// a warm amber ring (the passage's anchors); plain waypoints get a small ink ring.
function RouteMarkers({ route }: { route: RouteData }) {
  const points = route.points
  if (!points || points.length === 0) return null
  return (
    <>
      {points.map((p, i) => {
        const isStop = p.type === "stop"
        // Sequential overnight number = stops up to and including this point.
        const stopNo = points.slice(0, i + 1).filter((q) => q.type === "stop").length
        const icon = isStop
          ? ringIcon(palette.sunset500, "stop", stopNo)
          : ringIcon(INK, "position")
        return (
          <Marker
            key={`${route.id}-${i}`}
            position={[p.lat, p.lon]}
            icon={icon}
            interactive={false}
            keyboard={false}
          />
        )
      })}
    </>
  )
}

// Frame the chart ON the itinerary (zoomed in, capped at the overview max) rather
// than a fixed far-out centre — so the parallax reveal lands on a well-scaled
// passage and the route sits centred, not stranded high. Re-fits on resize/
// breakpoint. Falls back to the fixed centre/zoom when there is no route yet.
function FrameRoute({ routes, variant }: { routes: RouteData[]; variant: Variant }) {
  const map = useMap()
  useEffect(() => {
    const pts = routes.flatMap((r) => r.positions) as [number, number][]
    if (pts.length === 0) return
    const bounds = L.latLngBounds(pts)
    const fit = () => {
      const compact = window.matchMedia("(max-width: 639px)").matches
      // The banner is a short strip with no header to clear, so it frames tight.
      const pad: L.PointTuple = variant === "banner" ? [24, 20] : [compact ? 32 : 56, 88]
      const padBR: L.PointTuple =
        variant === "banner" ? [24, 20] : [compact ? 32 : 56, compact ? 120 : 72]
      map.fitBounds(bounds, {
        paddingTopLeft: pad,
        paddingBottomRight: padBR,
        maxZoom: MAX_ZOOM,
        animate: false,
      })
    }
    fit()
    window.addEventListener("resize", fit)
    return () => window.removeEventListener("resize", fit)
  }, [map, routes, variant])
  return null
}

// Toggle the pan/zoom handlers to match `interactive`. Desktop is a fully
// interactive chart (drag + wheel-zoom within the locked range); the mobile
// poster disables everything so a touch-swipe scrolls the page (dissipating the
// cartouche) instead of being captured by the map.
function Interactions({ interactive }: { interactive: boolean }) {
  const map = useMap()
  useEffect(() => {
    const handlers = [
      map.dragging,
      map.touchZoom,
      map.doubleClickZoom,
      map.boxZoom,
      map.keyboard,
      map.scrollWheelZoom,
    ]
    handlers.forEach((h) => (interactive ? h.enable() : h.disable()))
  }, [map, interactive])
  return null
}

export function LandingMap({
  routes = [],
  center = [41.55, 3.75],
  zoom = 8,
  interactive = true,
  variant = "hero",
}: Props) {
  const isHero = variant === "hero"
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      className="h-full w-full"
      zoomControl={false}
      attributionControl={false}
      scrollWheelZoom={false}
    >
      <Interactions interactive={interactive} />
      <FrameRoute routes={routes} variant={variant} />
      <TileLayer url={ESRI_OCEAN} />
      <TileLayer url={SEAMARK} />
      <Graticule />
      {/* Forecast cell + scale bar are the loud instruments — hero only. The banner
          stays a calm chart bridge, and the ambient wind never runs on the dashboard. */}
      {isHero && <ScaleBar />}
      {isHero && <ForecastCell routes={routes} />}
      {routes.map((route) =>
        route.positions.length === 0 ? null : (
          <Fragment key={route.id}>
            {/* White halo under ocean ink — the engraved chart-line look.
                Slightly bolder than the graticule so the passage reads clearly
                against the bathymetric blue. */}
            <Polyline
              positions={route.positions}
              pathOptions={{ color: PAPER, weight: 6, opacity: 0.9 }}
            />
            <Polyline
              positions={route.positions}
              pathOptions={{ color: DEEP, weight: 3, opacity: 1 }}
            />
            {/* Marked passage: overnight stops as numbered amber anchors,
                waypoints as small ink rings — the shared planner ringIcon. */}
            <RouteMarkers route={route} />
          </Fragment>
        ),
      )}
    </MapContainer>
  )
}
