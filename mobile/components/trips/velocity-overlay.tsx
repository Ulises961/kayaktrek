import { Canvas, Points, type SkPoint } from "@shopify/react-native-skia"
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react"
import { StyleSheet } from "react-native"
import { useSharedValue } from "react-native-reanimated"

import type { Particle } from "../../lib/weather/advection"
import type { MapViewState } from "../../lib/map/project-lng-lat"
import {
  advanceFrame,
  AREA_PADDING_PX,
  particleCountFor,
  seedParticles,
} from "../../lib/weather/velocity-frame"
import type { VelocityField } from "../../lib/weather/velocity"

// M35: the animated wind/swell field, drawn as short trails over the map. Particles
// live in longitude/latitude and are projected locally every frame from the map's own
// view state (lib/map/project-lng-lat.ts), so they follow pans, zooms and rotation as
// the map reports them — there is no hide-and-settle step like web's, which had to
// wait for leaflet-velocity to recompute its canvas.
//
// Density is set by the screen, as on web (leaflet-velocity: viewport pixels times
// particleMultiplier), and the particles are kept on the screen — a day's field can be
// many times bigger than the part being looked at, and spreading particles across all of
// it left most of them out of sight.
//
// The view arrives as a ref, read on each frame, not as a prop: the map reports a new
// view many times a second during a gesture, and passing it as state would re-render
// the whole screen for each of them.
//
// Drawn only on a flat map: a tilted view's perspective is not modelled, so the trails
// are cleared rather than drawn in the wrong place.
const MAX_PITCH_DEGREES = 1
// Visual drift speed: a 1 m/s flow crosses this many screen pixels per second.
const PIXELS_PER_SECOND_PER_METRE_SECOND = 8
// A long frame (a stall, the app backgrounded) must not fling every particle across the map.
const MAX_FRAME_SECONDS = 0.05

export function VelocityOverlay({
  field,
  viewRef,
  size,
  color,
  // Web's planner values: wind 0.0016 with 2.5 px lines, swell 0.0014 with 3.5 px.
  particleMultiplier = 0.0016,
  strokeWidth = 2.5,
}: {
  field: VelocityField
  /** The map's latest reported view; `current` is null until its first report. */
  viewRef: RefObject<MapViewState | null>
  size: { width: number; height: number }
  color: string
  particleMultiplier?: number
  strokeWidth?: number
}) {
  const lines = useSharedValue<SkPoint[]>([])
  const sizeRef = useRef(size)
  const hasSize = size.width > 0 && size.height > 0
  // Sized to the area particles live in (the screen plus its margin), so the density on
  // the screen itself is what was asked for.
  const count = particleCountFor(
    { width: size.width + 2 * AREA_PADDING_PX, height: size.height + 2 * AREA_PADDING_PX },
    particleMultiplier,
  )

  // The frame loop reads the latest size without being restarted by it: a restart would
  // respawn every particle.
  useLayoutEffect(() => {
    sizeRef.current = size
  }, [size])

  useEffect(() => {
    if (!hasSize) return

    // Seeded on the first frame that has a view, not here: the particles are placed over
    // what the screen is showing, which is not known until the map has reported it.
    let particles: Particle[] | null = null
    let frame = 0
    let last: number | null = null

    const tick = (now: number) => {
      const view = viewRef.current
      const dt = last === null ? 0 : Math.min((now - last) / 1000, MAX_FRAME_SECONDS)
      last = now

      if (view && Math.abs(view.pitch) >= MAX_PITCH_DEGREES) {
        lines.set([])
      } else if (view) {
        particles ??= seedParticles(field, view, sizeRef.current, count)
        if (dt > 0) {
          const segments = advanceFrame(particles, field, view, sizeRef.current, dt, {
            pixelsPerSecondPerMetreSecond: PIXELS_PER_SECOND_PER_METRE_SECOND,
          })
          // Skia's "lines" mode draws a line between each consecutive pair of points.
          lines.set(segments.flat())
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frame)
  }, [field, count, hasSize, viewRef, lines])

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
        opacity={0.85}
      />
    </Canvas>
  )
}
