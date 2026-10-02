import { Canvas, Circle, DashPathEffect, Points, type SkPoint } from "@shopify/react-native-skia"
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react"
import { StyleSheet } from "react-native"
import { useSharedValue } from "react-native-reanimated"

import { palette } from "@shared/tokens"

import type { Particle } from "../../lib/weather/advection"
import type { MapViewState } from "../../lib/map/project-lng-lat"
import { discOnScreen } from "../../lib/weather/forecast-cell"
import {
  advanceFrame,
  AREA_PADDING_PX,
  particleCountFor,
  particleCountForForecast,
  seedParticles,
} from "../../lib/weather/velocity-frame"
import type { VelocityField } from "../../lib/weather/velocity"

// M35: the animated wind/swell field, drawn as short trails over the map. Particles
// live in longitude/latitude and are projected locally every frame from the map's own
// view state (lib/map/project-lng-lat.ts).
//
// While the map is being zoomed or panned the trails are taken away, and put back only
// once the view has been still for VIEW_SETTLE_MS and everything that depends on it —
// the area the particles live in, and how many of them that area gets — has been worked
// out again, over fresh particles, faded in. This is web's behaviour too (it hides on
// movestart/zoomstart and waits for leaflet-velocity to settle). Drawing through a
// gesture shows a field for ground the screen has already moved off, and zooming out
// leaves the old particles bunched where the view used to be. The ring is only geometry,
// so it follows the map the whole time.
//
// Density is set by the screen, as on web (leaflet-velocity: viewport pixels times
// particleMultiplier) — here by the part of it the forecast disc covers, so it thins as
// the disc shrinks on screen when zooming out.
//
// The view arrives as a ref, read on each frame, not as a prop: the map reports a new
// view many times a second during a gesture, and passing it as state would re-render
// the whole screen for each of them.
//
// Drawn only on a flat map: a tilted view's perspective is not modelled, so the trails
// and ring are cleared rather than drawn in the wrong place.
const MAX_PITCH_DEGREES = 1
// Visual drift speed: a 1 m/s flow crosses this many screen pixels per second.
const PIXELS_PER_SECOND_PER_METRE_SECOND = 8
// A long frame (a stall, the app backgrounded) must not fling every particle across the map.
const MAX_FRAME_SECONDS = 0.05

/** How long the view must stand still before the trails come back. Web waits 320 ms. */
export const VIEW_SETTLE_MS = 350
const FADE_IN_MS = 300
const TRAIL_OPACITY = 0.85

// Smaller than this is the map reporting the same view again, not movement.
const ZOOM_EPSILON = 1e-3
const CENTER_EPSILON_DEGREES = 1e-6
const BEARING_EPSILON_DEGREES = 0.05

function viewChanged(before: MapViewState, after: MapViewState): boolean {
  return (
    Math.abs(before.zoom - after.zoom) > ZOOM_EPSILON ||
    Math.abs(before.center[0] - after.center[0]) > CENTER_EPSILON_DEGREES ||
    Math.abs(before.center[1] - after.center[1]) > CENTER_EPSILON_DEGREES ||
    Math.abs(before.bearing - after.bearing) > BEARING_EPSILON_DEGREES
  )
}

// Web's contour ring (ForecastCellShell): chart ink, a thin dashed line, outline only.
const RING_COLOR = palette.ocean700
const RING_WIDTH = 1.25
const RING_OPACITY = 0.5
const RING_DASH: [number, number] = [2, 7]

export function VelocityOverlay({
  field,
  viewRef,
  size,
  color,
  // Web's planner values: wind 0.0016 with 2.5 px lines, swell 0.0014 with 3.5 px.
  particleMultiplier = 0.0016,
  strokeWidth = 2.5,
  strokeCap = "round",
  trail,
  dashes,
  disc,
  drawRing = false,
}: {
  field: VelocityField
  /** The map's latest reported view; `current` is null until its first report. */
  viewRef: RefObject<MapViewState | null>
  size: { width: number; height: number }
  color: string
  particleMultiplier?: number
  strokeWidth?: number
  /** Round ends read as lines (wind); square ends read as dashes (swell). */
  strokeCap?: "round" | "butt"
  /** This layer's own trail look: wind is long streaks, swell short dashes. */
  trail?: { seconds?: number; minPixels?: number; maxPixels?: number }
  /** Draw each particle as separate dashes with gaps (swell), not one continuous trail (wind). */
  dashes?: { count: number; lengthPixels: number; gapPixels: number }
  /** The forecast area, as web draws it: [latitude, longitude] and a radius. */
  disc?: { center: [number, number]; radiusKm: number }
  /** Only one layer draws the ring when wind and swell are both on. */
  drawRing?: boolean
}) {
  const lines = useSharedValue<SkPoint[]>([])
  const ringX = useSharedValue(0)
  const ringY = useSharedValue(0)
  // A radius of 0 is "not drawn".
  const ringRadius = useSharedValue(0)
  // Held at 0 while the trails are away, then ramped up to TRAIL_OPACITY.
  const opacity = useSharedValue(0)
  const sizeRef = useRef(size)
  const hasSize = size.width > 0 && size.height > 0
  const showRing = drawRing && disc !== undefined
  const trailSeconds = trail?.seconds
  const minTrailPixels = trail?.minPixels
  const maxTrailPixels = trail?.maxPixels
  const dashCount = dashes?.count
  const dashLengthPixels = dashes?.lengthPixels
  const dashGapPixels = dashes?.gapPixels

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
        ringRadius.set(0)
        lastView = { ...view }
      } else if (view) {
        const moved = lastView !== null && viewChanged(lastView, view)
        lastView = { ...view, center: [...view.center] }

        // The ring is geometry, not animation, so it keeps up with the map throughout.
        if (showRing && disc) {
          const ring = discOnScreen(view, sizeRef.current, disc.center, disc.radiusKm)
          ringX.set(ring.x)
          ringY.set(ring.y)
          ringRadius.set(ring.radius)
        }

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
              trailSeconds,
              minTrailPixels,
              maxTrailPixels,
              dashes:
                dashCount !== undefined && dashLengthPixels !== undefined && dashGapPixels !== undefined
                  ? { count: dashCount, lengthPixels: dashLengthPixels, gapPixels: dashGapPixels }
                  : undefined,
            })
            // Skia's "lines" mode draws a line between each consecutive pair of points.
            lines.set(segments.flat())
          }
          if (!fadeDone) {
            const progress = Math.min(1, (now - fadeStartedAt) / FADE_IN_MS)
            opacity.set(progress * TRAIL_OPACITY)
            fadeDone = progress >= 1
          }
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frame)
  }, [
    field,
    hasSize,
    viewRef,
    lines,
    ringX,
    ringY,
    ringRadius,
    opacity,
    showRing,
    disc,
    particleMultiplier,
    trailSeconds,
    minTrailPixels,
    maxTrailPixels,
    dashCount,
    dashLengthPixels,
    dashGapPixels,
  ])

  if (!hasSize) return null

  return (
    <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
      {showRing && (
        <Circle
          cx={ringX}
          cy={ringY}
          r={ringRadius}
          style="stroke"
          strokeWidth={RING_WIDTH}
          color={RING_COLOR}
          opacity={RING_OPACITY}
        >
          <DashPathEffect intervals={RING_DASH} />
        </Circle>
      )}
      <Points
        points={lines}
        mode="lines"
        color={color}
        style="stroke"
        strokeWidth={strokeWidth}
        strokeCap={strokeCap}
        opacity={opacity}
      />
    </Canvas>
  )
}
