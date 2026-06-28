"use client"

import { useMemo, useState } from "react"
import { Circle, Marker, useMapEvents } from "react-leaflet"
import L from "leaflet"
import { VelocityLayer } from "@/components/weather/velocity-layer"
import { cellForRoutes, WIND_COLOR_SCALE } from "@/lib/landing/ambient-wind"
import type { RouteData } from "@/lib/itinerary/public-routes"
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
