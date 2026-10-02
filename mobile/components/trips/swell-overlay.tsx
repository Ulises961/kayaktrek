import { Canvas, Points, type SkPoint } from "@shopify/react-native-skia"
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react"
import { StyleSheet } from "react-native"
import { useSharedValue } from "react-native-reanimated"

import type { MapViewState } from "../../lib/map/project-lng-lat"
import { VIEW_SETTLE_MS, viewChanged } from "../../lib/map/view-change"
import {
  SWELL_MIN_ALPHA,
  swellDashes,
  swellLattice,
  type SwellNode,
} from "../../lib/weather/swell-dashes"
import type { VelocityField } from "../../lib/weather/velocity"

// M35: swell drawn as one dash per data point, fading in place while the next appears a fixed
// step further along the flow (lib/weather/swell-dashes.ts has the geometry and timing). Not
// particles, so nothing here moves: the "travel" is a sequence of dashes, which is what makes it
// read as waves rather than as a second kind of wind.
//
// It behaves like the wind layer when the map moves: taken away at once, and put back — over a
// lattice worked out again for the new view, faded in — only after the view has been still for
// VIEW_SETTLE_MS. Drawn only on a flat map.
//
// Each dash fades on its own, but a Skia paint has one opacity, so the dashes are sorted into
// five levels of opacity and each level is drawn as one set of lines.
const MAX_PITCH_DEGREES = 1
export const SWELL_FADE_IN_MS = 300
export const SWELL_LEVELS = 5
export const SWELL_MAX_OPACITY = 0.9
/** Swell is white: direction matters more than speed, the standard chart convention, and web's too. */
export const SWELL_COLOR = "rgb(255, 255, 255)"
// Lightest first: level i is drawn at (i + 1) / SWELL_LEVELS of the strongest.
const LEVEL_OPACITIES = Array.from(
  { length: SWELL_LEVELS },
  (_, level) => ((level + 1) / SWELL_LEVELS) * SWELL_MAX_OPACITY,
)

export function SwellOverlay({
  field,
  viewRef,
  size,
  color = SWELL_COLOR,
  strokeWidth = 3,
}: {
  field: VelocityField
  /** The map's latest reported view; `current` is null until its first report. */
  viewRef: RefObject<MapViewState | null>
  size: { width: number; height: number }
  color?: string
  strokeWidth?: number
}) {
  const level0 = useSharedValue<SkPoint[]>([])
  const level1 = useSharedValue<SkPoint[]>([])
  const level2 = useSharedValue<SkPoint[]>([])
  const level3 = useSharedValue<SkPoint[]>([])
  const level4 = useSharedValue<SkPoint[]>([])
  const sizeRef = useRef(size)
  const hasSize = size.width > 0 && size.height > 0

  useLayoutEffect(() => {
    sizeRef.current = size
  }, [size])

  useEffect(() => {
    if (!hasSize) return
    const levels = [level0, level1, level2, level3, level4]

    // Null while the dashes are away (before the first view, and while the map moves).
    let nodes: SwellNode[] | null = null
    let lastView: MapViewState | null = null
    // When the view last changed; -Infinity so the very first view is drawn at once.
    let changedAt = Number.NEGATIVE_INFINITY
    let fadeStartedAt = 0
    let frame = 0

    function takeDashesAway(now: number) {
      nodes = null
      changedAt = now
      for (const level of levels) level.set([])
    }

    const tick = (now: number) => {
      const view = viewRef.current

      if (view && Math.abs(view.pitch) >= MAX_PITCH_DEGREES) {
        takeDashesAway(now)
        lastView = { ...view, center: [...view.center] }
      } else if (view) {
        const moved = lastView !== null && viewChanged(lastView, view)
        lastView = { ...view, center: [...view.center] }
        if (moved) takeDashesAway(now)

        // Back once the view has been still long enough: a lattice for this view, fading in.
        if (nodes === null && now - changedAt >= VIEW_SETTLE_MS) {
          nodes = swellLattice(field, view, sizeRef.current)
          fadeStartedAt = now
        }

        if (nodes !== null) {
          const fade = Math.min(1, (now - fadeStartedAt) / SWELL_FADE_IN_MS)
          const points: SkPoint[][] = levels.map(() => [])
          for (const dash of swellDashes(nodes, view, sizeRef.current, now / 1000)) {
            const alpha = dash.alpha * fade
            if (alpha < SWELL_MIN_ALPHA) continue
            const level = Math.min(SWELL_LEVELS - 1, Math.floor(alpha * SWELL_LEVELS))
            // Skia's "lines" mode draws a line between each consecutive pair of points.
            points[level].push(dash.from, dash.to)
          }
          levels.forEach((shared, index) => shared.set(points[index]))
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frame)
  }, [field, hasSize, viewRef, level0, level1, level2, level3, level4])

  if (!hasSize) return null

  const levels = [level0, level1, level2, level3, level4]
  return (
    <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
      {levels.map((points, level) => (
        <Points
          key={level}
          points={points}
          mode="lines"
          color={color}
          style="stroke"
          strokeWidth={strokeWidth}
          strokeCap="butt"
          opacity={LEVEL_OPACITIES[level]}
        />
      ))}
    </Canvas>
  )
}
