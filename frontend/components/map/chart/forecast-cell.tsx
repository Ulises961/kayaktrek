"use client"

import { useMemo, useState } from "react"
import { Circle, Marker, useMapEvents } from "react-leaflet"
import L from "leaflet"
import { VelocityLayer } from "@/components/weather/velocity-layer"
import { cellForRoutes, WIND_COLOR_SCALE } from "@/lib/landing/ambient-wind"
import type { RouteData } from "@/lib/itinerary/public-routes"
import type { VelocityGridLayer } from "@/lib/types/ui"
import { CHART_INK as INK, CHART_PAPER_GLOW as PAPER_GLOW } from "./chart-theme"

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

// Small chart-marginalia note pinned to the cell's south rim. The one fact this
// label carries is the cell's COVERAGE EXTENT (its diameter) — never a wind value,
// unit, or time. Rounding to 5 km avoids implying a precision the field does not
// have. "illustrative" is appended only for the decorative landing field (real
// planner data omits it). A bounded extent label can't masquerade as a forecast.
function noteIcon(radiusKm: number, illustrative: boolean): L.DivIcon {
  const span = Math.round((radiusKm * 2) / 5) * 5 // diameter, 5 km steps
  // Landing is decorative — it must never read as a forecast, so it keeps the
  // "illustrative" wording. The planner shows real data, so it names the fact:
  // this is the forecast's coverage extent.
  const text = illustrative
    ? `≈ ${span} km coverage · illustrative`
    : `≈ ${span} km forecast coverage`
  return L.divIcon({
    className: "",
    html: `<div style="white-space:nowrap;font-family:var(--font-mono),ui-monospace,monospace;font-size:10px;letter-spacing:0.04em;color:${INK};opacity:0.7;text-shadow:0 1px 2px ${PAPER_GLOW};">${text}</div>`,
    iconSize: [0, 0],
    iconAnchor: [-8, -6],
  })
}

export type ForecastCellLayer = {
  grid: VelocityGridLayer[]
  options: Record<string, unknown>
}

/**
 * Source-agnostic presentational shell for a forecast cell: one or more velocity
 * fields sharing a single disc, a contour ring, and a coverage-extent note. The
 * grids are pre-clipped by the caller (the landing synthesizes its decorative
 * grid; the M5b planner passes the real land-masked grid via maskGridToDisc), so
 * this only draws. One ring + one note per cell even when both wind and swell run.
 */
export function ForecastCellShell({
  layers,
  center,
  radiusKm,
  illustrative = false,
}: {
  layers: ForecastCellLayer[]
  center: [number, number]
  radiusKm: number
  illustrative?: boolean
}) {
  const radiusM = radiusKm * 1000
  const southRim: [number, number] = [center[0] - radiusKm / 111, center[1]]

  return (
    <>
      {layers.map((layer, index) => (
        <VelocityLayer key={index} data={layer.grid} options={layer.options} />
      ))}
      {/* Contour ring — chart neat-line language. Outline only: a fill would
          tint the map (the very "heatmap on top" we're removing). */}
      <Circle
        center={center}
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
        icon={noteIcon(radiusKm, illustrative)}
        interactive={false}
        keyboard={false}
      />
    </>
  )
}

// Decorative landing wrapper: synthesizes the ambient flow disc and renders it
// through the shared shell, labelled "illustrative".
export function ForecastCell({ routes }: { routes: RouteData[] }) {
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

  return (
    <ForecastCellShell
      layers={[{ grid: cell.grid, options }]}
      center={cell.center}
      radiusKm={cell.radiusKm}
      illustrative
    />
  )
}
