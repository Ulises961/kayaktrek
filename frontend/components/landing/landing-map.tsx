"use client"

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  MapContainer,
  TileLayer,
  Polyline,
  Circle,
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { VelocityLayer } from "@/components/weather/velocity-layer"
import { ringIcon } from "@/components/map/ring-icon"
import { cellForRoutes, WIND_COLOR_SCALE } from "@/lib/landing/ambient-wind"
import type { RouteData } from "@/lib/itinerary/public-routes"
import { palette } from "@/lib/tokens"

// Chart chrome palette — named aliases over the maritime tokens so the
// engraved graticule/scale/ink language reads at a glance.
const INK = palette.ocean700 // graticule, scale bar, marginalia
const DEEP = palette.ocean900 // route line core
const PAPER = palette.chartPaper // route halo + alternating scale-bar cells
// chartPaper (#f7f4ec) at 0.9 alpha — legibility glow behind chart marginalia.
const PAPER_GLOW = "rgba(247,244,236,0.9)"

type Props = {
  routes?: RouteData[]
  center?: [number, number]
  zoom?: number
  // When false the map is a static poster (no drag/zoom) so page-scroll is never
  // captured — used on mobile, where touch-drag would fight the scroll-dissipate.
  interactive?: boolean
}

// Esri Ocean Basemap — soft bathymetric Mediterranean blue, water-forward.
const ESRI_OCEAN =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}"
const SEAMARK = "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"

// Ambient, decorative wind — carries motion + palette. No legend: see
// lib/landing/ambient-wind.ts for why this must never read as a forecast.
//
// Streak length = (velocityScale × magnitude) × (frames the trail survives).
// - velocityScale → distance a particle travels per frame: governs BOTH on-screen
//   motion speed AND streak length, decoupled from colour (which reads the real m/s
//   magnitude). Kept deliberately low so the gentle breeze drifts slowly — fast
//   particles would read as a gale even though the colour band says "calm".
// - opacity → trail-fade (how much of the previous frame is kept). High + dense
//   = smear; with the per-zoom multiplier holding the count down it can sit a bit
//   higher for visible trails. particleAge keeps particles alive longer (steadier).
// - min/maxVelocity → the wind-speed window the colour ramp spans. 0–10 m/s maps
//   WIND_COLOR_SCALE's calm blue→teal band; the gentle field stays well inside it.
const VELOCITY_BASE = {
  colorScale: WIND_COLOR_SCALE,
  velocityScale: 0.008,
  particleAge: 90,
  lineWidth: 1.8,
  opacity: 0.8,
  frameRate: 20,
  minVelocity: 0,
  maxVelocity: 10,
}

// Particle density vs zoom. leaflet-velocity ties particleCount to the viewport
// (count = viewportPx × particleMultiplier), and masked cells only survive inside
// the disc — so on-screen density inside the disc equals the multiplier. This
// tapers it deliberately: fewer particles zoomed OUT (a clean, sparse patch, never
// a thick blob), more as you zoom IN and the cell opens up. Flip the exponent sign
// to reverse the feel; clamps stop it ever blobbing (max) or emptying (min).
const REF_ZOOM = 8
const BASE_MULTIPLIER = 1 / 900
function multiplierForZoom(zoom: number): number {
  const factor = Math.pow(2, (zoom - REF_ZOOM) * 0.5)
  return Math.min(1 / 250, Math.max(1 / 5000, BASE_MULTIPLIER * factor))
}

// Zoom is locked to Esri Ocean's useful range for this region: it thins to
// "no data" past ~z11, and the landing is a calm discovery chart, not the
// route-detail planner (which uses OSM). Locking keeps the chart aesthetic
// intact rather than swapping to a busy street basemap mid-interaction.
const MIN_ZOOM = 6
const MAX_ZOOM = 10

// True while a zoom/pan gesture is in flight, flipping back `settled` a beat after
// it ends. Vector overlays computed for the old viewport get CSS-transformed during
// the animation and read as "out of phase" until redrawn — callers hide themselves
// while unsettled and redraw fresh on settle (same idea as VelocityLayer's fade).
function useSettled(delay = 280): boolean {
  const [settled, setSettled] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
  }
  useMapEvents({
    movestart: () => {
      clear()
      setSettled(false)
    },
    zoomstart: () => {
      clear()
      setSettled(false)
    },
    moveend: () => {
      clear()
      timer.current = setTimeout(() => setSettled(true), delay)
    },
    zoomend: () => {
      clear()
      timer.current = setTimeout(() => setSettled(true), delay)
    },
  })
  useEffect(() => clear, [])
  return settled
}

// ── Graticule ────────────────────────────────────────────────────────────────
// A real geographic lat/lon grid drawn across the whole chart (the old ticks were
// CSS marginalia fixed to the frame border). Lines are meridians/parallels at a
// per-zoom degree step; they pan and zoom with the map like a true chart graticule.
function niceStep(zoom: number): number {
  if (zoom >= 10) return 0.25
  if (zoom >= 8) return 0.5
  return 1
}

function fmtDeg(value: number, pos: string, neg: string): string {
  const a = Math.abs(value)
  const s = Number.isInteger(a) ? `${a}` : a.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
  return `${s}°${value >= 0 ? pos : neg}`
}

function gratLabelIcon(text: string, anchor: [number, number], weight = 400): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<span style="font-family:var(--font-mono),ui-monospace,monospace;font-size:11px;font-weight:${weight};letter-spacing:0.04em;color:${INK};opacity:0.68;text-shadow:0 1px 2px ${PAPER_GLOW};">${text}</span>`,
    iconSize: [0, 0],
    iconAnchor: anchor,
  })
}

function Graticule() {
  const map = useMap()
  // Hide the grid during a gesture and redraw it (fresh bounds) once settled, so
  // it never shows the transformed, out-of-phase lines while zooming/panning.
  const settled = useSettled()
  if (!settled) return null

  const b = map.getBounds()
  const step = niceStep(map.getZoom())
  const south = b.getSouth()
  const north = b.getNorth()
  const west = b.getWest()
  const east = b.getEast()
  const lineOpts = { color: INK, weight: 0.7, opacity: 0.42, interactive: false } as const

  const els: ReactNode[] = []
  for (let lon = Math.ceil(west / step) * step; lon <= east; lon += step) {
    const k = `m${lon.toFixed(3)}`
    els.push(
      <Polyline
        key={k}
        positions={[
          [south, lon],
          [north, lon],
        ]}
        pathOptions={lineOpts}
      />,
    )
    // Drop the label below the top edge so it clears the header strip.
    els.push(
      <Marker
        key={`${k}t`}
        position={[north, lon]}
        icon={gratLabelIcon(fmtDeg(lon, "E", "W"), [10, -64])}
        interactive={false}
        keyboard={false}
      />,
    )
  }
  for (let lat = Math.ceil(south / step) * step; lat <= north; lat += step) {
    const k = `p${lat.toFixed(3)}`
    els.push(
      <Polyline
        key={k}
        positions={[
          [lat, west],
          [lat, east],
        ]}
        pathOptions={lineOpts}
      />,
    )
    // Labels on the right edge — the left is occupied by the cartouche.
    els.push(
      <Marker
        key={`${k}l`}
        position={[lat, east]}
        icon={gratLabelIcon(fmtDeg(lat, "N", "S"), [34, -4], 600)}
        interactive={false}
        keyboard={false}
      />,
    )
  }
  return <>{els}</>
}

// ── Scale bar ────────────────────────────────────────────────────────────────
// The ruler every chart carries — a segmented nautical-style bar showing the real
// ground distance at the current center/zoom, so the graticule's degrees have a
// metric reference. Built as a Leaflet control (correctly positioned, above map).
const EARTH_CIRCUMFERENCE_M = 40075016.686
const SCALE_TARGET_PX = 188

function metersPerPixel(lat: number, zoom: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / 2 ** (zoom + 8)
}

// Largest 1/2/5 × 10ⁿ metres that fits the target width — the "nice round number"
// a chart ruler always lands on.
function niceScaleMeters(maxMeters: number): number {
  const pow = 10 ** Math.floor(Math.log10(maxMeters))
  for (const mult of [5, 2, 1]) {
    if (mult * pow <= maxMeters) return mult * pow
  }
  return pow / 2
}

function fmtDistance(m: number): string {
  return m >= 1000 ? `${m / 1000} km` : `${m} m`
}

function scaleBarHtml(px: number, meters: number): string {
  const segs = 4
  const segPx = px / segs
  const cells = Array.from({ length: segs }, (_, i) => {
    const fill = i % 2 === 0 ? INK : PAPER
    return `<div style="width:${segPx}px;height:9px;background:${fill};border-right:1px solid ${INK};"></div>`
  }).join("")
  return `<div style="font-family:var(--font-mono),ui-monospace,monospace;color:${INK};text-shadow:0 1px 2px ${PAPER_GLOW};">
    <div style="display:flex;width:${px}px;border:1px solid ${INK};border-right:none;">${cells}</div>
    <div style="display:flex;justify-content:space-between;width:${px}px;font-size:11px;letter-spacing:0.04em;margin-top:4px;opacity:0.85;"><span>0</span><span>${fmtDistance(meters)}</span></div>
  </div>`
}

function ScaleBar() {
  const map = useMap()
  useEffect(() => {
    // On desktop the cartouche sits bottom-left, so bottom-right is clear. On
    // mobile the cartouche spans the bottom — move the bar up to the top-right
    // (empty water under the header) so it is never occluded.
    const mq = window.matchMedia("(min-width: 640px)")
    let control: L.Control | null = null
    let el: HTMLElement | null = null
    const render = () => {
      if (!el) return
      const mpp = metersPerPixel(map.getCenter().lat, map.getZoom())
      const meters = niceScaleMeters(SCALE_TARGET_PX * mpp)
      el.innerHTML = scaleBarHtml(meters / mpp, meters)
    }
    const mount = () => {
      const desktop = mq.matches
      control = new L.Control({ position: desktop ? "bottomright" : "topright" })
      control.onAdd = () => {
        el = L.DomUtil.create("div")
        el.style.margin = desktop ? "0 42px 40px 0" : "60px 16px 0 0"
        render()
        return el
      }
      control.addTo(map)
    }
    const remount = () => {
      control?.remove()
      el = null
      mount()
    }
    mount()
    mq.addEventListener("change", remount)
    map.on("zoomend moveend", render)
    return () => {
      mq.removeEventListener("change", remount)
      map.off("zoomend moveend", render)
      control?.remove()
    }
  }, [map])
  return null
}

// Small chart-marginalia note pinned to the cell's south rim. The one fact this
// label carries is the cell's COVERAGE EXTENT (its diameter) — never a wind value,
// unit, or time. "illustrative" keeps it honest; rounding to 5 km avoids implying
// a precision the synthesized field does not have. A bounded extent label can't
// masquerade as a forecast.
function noteIcon(radiusKm: number): L.DivIcon {
  const span = Math.round((radiusKm * 2) / 5) * 5 // diameter, 5 km steps
  return L.divIcon({
    className: "",
    html: `<div style="white-space:nowrap;font-family:var(--font-mono),ui-monospace,monospace;font-size:10px;letter-spacing:0.04em;color:${INK};opacity:0.7;text-shadow:0 1px 2px ${PAPER_GLOW};">≈ ${span} km coverage · illustrative</div>`,
    iconSize: [0, 0],
    iconAnchor: [-8, -6],
  })
}

function ForecastCellLayer({ routes }: { routes: RouteData[] }) {
  // Track LIVE zoom (the prop was the static initial value). zoomend is enough —
  // density only needs to settle after the gesture, not update mid-animation.
  const map = useMapEvents({ zoomend: () => setZoom(map.getZoom()) })
  const [zoom, setZoom] = useState(() => map.getZoom())

  const cell = useMemo(() => cellForRoutes(routes.flatMap((r) => r.positions)), [routes])
  // A NEW object each time zoom changes, so VelocityLayer's options effect fires
  // and applies the multiplier in place (mutating a shared const would not).
  const options = useMemo(
    () => ({ ...VELOCITY_BASE, particleMultiplier: multiplierForZoom(zoom) }),
    [zoom],
  )

  const radiusM = cell.radiusKm * 1000
  const southRim: [number, number] = [cell.center[0] - cell.radiusKm / 111, cell.center[1]]

  return (
    <>
      <VelocityLayer data={cell.grid} options={options} />
      {/* Contour ring — chart neat-line language. Outline only: a fill would
          tint the map (the very "heatmap on top" we're removing). */}
      <Circle
        center={cell.center}
        radius={radiusM}
        pathOptions={{
          color: INK,
          weight: 1.25,
          opacity: 0.5,
          dashArray: "2 7",
          fill: false,
        }}
      />
      <Marker
        position={southRim}
        icon={noteIcon(cell.radiusKm)}
        interactive={false}
        keyboard={false}
      />
    </>
  )
}

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
function FrameRoute({ routes }: { routes: RouteData[] }) {
  const map = useMap()
  useEffect(() => {
    const pts = routes.flatMap((r) => r.positions) as [number, number][]
    if (pts.length === 0) return
    const bounds = L.latLngBounds(pts)
    const fit = () => {
      const compact = window.matchMedia("(max-width: 639px)").matches
      map.fitBounds(bounds, {
        paddingTopLeft: [compact ? 32 : 56, 88], // clear the header strip
        paddingBottomRight: [compact ? 32 : 56, compact ? 120 : 72],
        maxZoom: MAX_ZOOM,
        animate: false,
      })
    }
    fit()
    window.addEventListener("resize", fit)
    return () => window.removeEventListener("resize", fit)
  }, [map, routes])
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
}: Props) {
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
      <FrameRoute routes={routes} />
      <TileLayer url={ESRI_OCEAN} />
      <TileLayer url={SEAMARK} />
      <Graticule />
      <ScaleBar />
      <ForecastCellLayer routes={routes} />
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
