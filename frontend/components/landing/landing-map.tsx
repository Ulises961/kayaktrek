"use client"

import { Fragment, useEffect, useState } from "react"
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
import { POINT_TYPE } from "@/lib/dtos/point"
import { palette } from "@/lib/tokens"
import {
  OSM_TILE_URL,
  SEAMARK_TILE_URL,
  OSM_ATTRIBUTION,
  SEAMARK_ATTRIBUTION,
} from "@/lib/map/tiles"

// "hero" is the full landing chart (all instruments) on the Esri Ocean basemap.
// "banner" is the calmer in-app bridge — graticule + route only, no forecast cell or
// scale bar, framed tight to a slim strip — on the OSM basemap the planner uses, so
// its tiles are cacheable and shared with the builder the card links into.
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

// Esri Ocean Basemap — soft bathymetric Mediterranean blue, water-forward. Used by
// the landing hero only: it is a proprietary tile product served client-direct with
// attribution and NEVER cached/re-served (Esri terms), which is fine for a low-volume
// marketing hero.
const ESRI_OCEAN =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}"

// Attribution is required by every provider's terms; suppressing it is a ToS gap.
const ESRI_ATTRIB =
  "Tiles &copy; Esri &mdash; Sources: GEBCO, NOAA, National Geographic, Garmin, HERE, and others"

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
        const isStop = p.type === POINT_TYPE.STOP
        // Sequential overnight number = stops up to and including this point.
        const stopNo = points.slice(0, i + 1).filter((q) => q.type === POINT_TYPE.STOP).length
        const icon = isStop
          ? ringIcon(palette.sunset500, POINT_TYPE.STOP, stopNo)
          : ringIcon(INK, POINT_TYPE.POSITION)
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
// `onReady` fires once, the first time this effect runs — win or skip (no
// routes). It's the explicit "the initial view is whatever it's going to be"
// signal chart furniture like Graticule waits on, rather than each guessing it
// from event timing (see Graticule's `ready` prop for why that races).
function FrameRoute({
  routes,
  variant,
  onReady,
}: {
  routes: RouteData[]
  variant: Variant
  onReady?: () => void
}) {
  const map = useMap()
  useEffect(() => {
    const pts = routes.flatMap((r) => r.positions) as [number, number][]
    if (pts.length === 0) {
      onReady?.()
      return
    }
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
    onReady?.()
    window.addEventListener("resize", fit)
    return () => window.removeEventListener("resize", fit)
  }, [map, routes, variant, onReady])
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

// Drop Leaflet's "Leaflet" prefix from the attribution control — the data credits
// (OSM/Esri/OpenSeaMap) are the load-bearing part and the prefix link clutters the
// chart aesthetic. The credits themselves stay visible, as the terms require.
function AttributionPrefix() {
  const map = useMap()
  useEffect(() => {
    map.attributionControl?.setPrefix(false)
  }, [map])
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
  // Gates Graticule until FrameRoute's initial fitBounds (or its no-routes skip)
  // has actually applied — otherwise the grid draws once from the map's fixed
  // construction-time center/zoom before catching up to the fitted extent.
  const [chartReady, setChartReady] = useState(false)
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      className="h-full w-full"
      zoomControl={false}
      scrollWheelZoom={false}
      // Banner thumbnails are always a link to a fully-attributed detail view
      // (route/trip/story page) — repeating the credit line on every card in a
      // list is noise, not attribution; the linked-through page carries it.
      attributionControl={variant !== "banner"}
    >
      <Interactions interactive={interactive} />
      <AttributionPrefix />
      <FrameRoute routes={routes} variant={variant} onReady={() => setChartReady(true)} />
      <TileLayer
        url={isHero ? ESRI_OCEAN : OSM_TILE_URL}
        attribution={isHero ? ESRI_ATTRIB : OSM_ATTRIBUTION}
      />
      <TileLayer url={SEAMARK_TILE_URL} attribution={SEAMARK_ATTRIBUTION} />
      {/* Graticule + forecast cell + scale bar are the loud instruments — hero only.
          A banner thumbnail is a small linked-through strip, same "noise, not
          attribution" rationale as the credit line above: a grid overlay on a
          ~7-8rem-tall card strip has no room to read coordinates, it's just
          clutter. The banner stays a calm chart bridge, and the ambient wind
          never runs on the dashboard. */}
      {isHero && <Graticule ready={chartReady} />}
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
