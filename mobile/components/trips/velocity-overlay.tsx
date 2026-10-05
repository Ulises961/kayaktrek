import { Canvas, Points, type SkPoint } from "@shopify/react-native-skia"
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react"
import { StyleSheet } from "react-native"
import { useSharedValue } from "react-native-reanimated"

import type { Particle } from "../../lib/weather/advection"
import type { MapViewState } from "../../lib/map/project-lng-lat"
import { VIEW_SETTLE_MS, viewChanged } from "../../lib/map/view-change"
import {
  advanceFrame,
  AREA_PADDING_PX,
  particleCountFor,
  particleCountForForecast,
  seedParticles,
} from "../../lib/weather/velocity-frame"
import type { VelocityField } from "../../lib/weather/velocity"

// M35: the animated wind field, drawn as short trails over the map. Particles live in
// longitude/latitude and are projected locally every frame from the map's own view state
// (lib/map/project-lng-lat.ts). Swell is not drawn here: it has its own renderer
// (swell-overlay.tsx), and the dashed ring that marks the forecast area is forecast-ring.tsx.
//
// While the map is being zoomed or panned the trails are taken away, and put back only
// once the view has been still for VIEW_SETTLE_MS and everything that depends on it —
// the area the particles live in, and how many of them that area gets — has been worked
// out again, over fresh particles, faded in. This is web's behaviour too (it hides on
// movestart/zoomstart and waits for leaflet-velocity to settle). Drawing through a
// gesture shows a field for ground the screen has already moved off, and zooming out
// leaves the old particles bunched where the view used to be.
//
// Density is set by the screen, as on web (leaflet-velocity: viewport pixels times
// particleMultiplier) — here by the part of it the forecast disc covers, so it thins as
// the disc shrinks on screen when zooming out.
//
// The view arrives as a ref, read on each frame, not as a prop: the map reports a new
// view many times a second during a gesture, and passing it as state would re-render
// the whole screen for each of them.
//
// Drawn only on a flat map: a tilted view's perspective is not modelled, so the trails are
// cleared rather than drawn in the wrong place.
const MAX_PITCH_DEGREES = 1
// Visual drift speed: a 1 m/s flow crosses this many screen pixels per second.
const PIXELS_PER_SECOND_PER_METRE_SECOND = 8
// A long frame (a stall, the app backgrounded) must not fling every particle across the map.
const MAX_FRAME_SECONDS = 0.05

export const WIND_FADE_IN_MS = 300
export const WIND_TRAIL_OPACITY = 0.85

export function VelocityOverlay({
  field,
  viewRef,
  size,
  color,
  // Web's planner values: wind 0.0016 with 2.5 px lines.
  particleMultiplier = 0.0016,
  strokeWidth = 2.5,
  disc,
}: {
  field: VelocityField
  /** The map's latest reported view; `current` is null until its first report. */
  viewRef: RefObject<MapViewState | null>
  size: { width: number; height: number }
  color: string
  particleMultiplier?: number
  strokeWidth?: number
  /** The forecast area, [latitude, longitude] and a radius: density follows how much of the screen it covers. */
  disc?: { center: [number, number]; radiusKm: number }
}) {
  const lines = useSharedValue<SkPoint[]>([])
  // Held at 0 while the trails are away, then ramped up to WIND_TRAIL_OPACITY.
  const opacity = useSharedValue(0)
  const sizeRef = useRef(size)
  const hasSize = size.width > 0 && size.height > 0

  // The frame loop reads the latest size without being restarted by it: a restart would
  // respawn every particle.
  useLayoutEffect(() => {
    sizeRef.current = size
  }, [size])

  useEffect(() => {
    if (!hasSize) return

    // Null while the trails are away (before the first view, and while the map moves).
    let particles: Particle[] | null = null
    let lastView: MapViewState | null = null
    // When the view last changed; -Infinity so the very first view is drawn at once.
    let changedAt = Number.NEGATIVE_INFINITY
    let fadeStartedAt = 0
    let fadeDone = false
    let frame = 0
    let last: number | null = null

    function takeTrailsAway(now: number) {
      particles = null
      changedAt = now
      lines.set([])
      opacity.set(0)
    }

    const tick = (now: number) => {
      const view = viewRef.current
      const dt = last === null ? 0 : Math.min((now - last) / 1000, MAX_FRAME_SECONDS)
      last = now

      if (view && Math.abs(view.pitch) >= MAX_PITCH_DEGREES) {
        takeTrailsAway(now)
        lastView = { ...view, center: [...view.center] }
      } else if (view) {
        const moved = lastView !== null && viewChanged(lastView, view)
        lastView = { ...view, center: [...view.center] }

        if (moved) takeTrailsAway(now)

        // Back once the view has been still long enough: re-seed over what is on screen
        // now, in a number worked out for this zoom, and fade in.
        if (particles === null && now - changedAt >= VIEW_SETTLE_MS) {
          const count = disc
            ? particleCountForForecast(view, sizeRef.current, disc, particleMultiplier)
            : particleCountFor(
                {
                  width: sizeRef.current.width + 2 * AREA_PADDING_PX,
                  height: sizeRef.current.height + 2 * AREA_PADDING_PX,
                },
                particleMultiplier,
              )
          particles = seedParticles(field, view, sizeRef.current, count)
          fadeStartedAt = now
          fadeDone = false
        }

        if (particles !== null) {
          if (dt > 0) {
            const segments = advanceFrame(particles, field, view, sizeRef.current, dt, {
              pixelsPerSecondPerMetreSecond: PIXELS_PER_SECOND_PER_METRE_SECOND,
            })
            // Skia's "lines" mode draws a line between each consecutive pair of points.
            lines.set(segments.flat())
          }
          if (!fadeDone) {
            const progress = Math.min(1, (now - fadeStartedAt) / WIND_FADE_IN_MS)
            opacity.set(progress * WIND_TRAIL_OPACITY)
            fadeDone = progress >= 1
          }
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frame)
  }, [field, hasSize, viewRef, lines, opacity, disc, particleMultiplier])

  if (!hasSize) return null

  return (
    <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Points
        points={lines}
        mode="lines"
        color={color}
        style="stroke"
        strokeWidth={strokeWidth}
        strokeCap="round"
        opacity={opacity}
      />
    </Canvas>
  )
}
