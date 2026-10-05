import { Canvas, Circle, DashPathEffect } from "@shopify/react-native-skia"
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react"
import { StyleSheet } from "react-native"
import { useSharedValue } from "react-native-reanimated"

import { palette } from "@shared/tokens"

import type { MapViewState } from "../../lib/map/project-lng-lat"
import { discOnScreen } from "../../lib/weather/forecast-cell"

// M35: the dashed ring that marks where the forecast stops — web's contour ring
// (ForecastCellShell): chart ink, a thin dashed outline, nothing filled. One ring per forecast
// area, whichever of wind and swell are showing inside it.
//
// It is geometry, not animation, so it follows the map frame by frame through a gesture and
// has no settle step like the overlays inside it. A tilted map's perspective is not modelled,
// so it is hidden rather than drawn in the wrong place.
const MAX_PITCH_DEGREES = 1
const RING_COLOR = palette.ocean700
const RING_WIDTH = 1.25
const RING_OPACITY = 0.5
const RING_DASH: [number, number] = [2, 7]

export function ForecastRing({
  disc,
  viewRef,
  size,
}: {
  /** The forecast area: [latitude, longitude] and a radius, as web's `discCell` gives it. */
  disc: { center: [number, number]; radiusKm: number }
  /** The map's latest reported view; `current` is null until its first report. */
  viewRef: RefObject<MapViewState | null>
  size: { width: number; height: number }
}) {
  const x = useSharedValue(0)
  const y = useSharedValue(0)
  // A radius of 0 is "not drawn".
  const radius = useSharedValue(0)
  const sizeRef = useRef(size)
  const hasSize = size.width > 0 && size.height > 0

  useLayoutEffect(() => {
    sizeRef.current = size
  }, [size])

  useEffect(() => {
    if (!hasSize) return

    let frame = 0
    const tick = () => {
      const view = viewRef.current
      if (view && Math.abs(view.pitch) >= MAX_PITCH_DEGREES) {
        radius.set(0)
      } else if (view) {
        const ring = discOnScreen(view, sizeRef.current, disc.center, disc.radiusKm)
        x.set(ring.x)
        y.set(ring.y)
        radius.set(ring.radius)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frame)
  }, [hasSize, viewRef, disc, x, y, radius])

  if (!hasSize) return null

  return (
    <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Circle
        cx={x}
        cy={y}
        r={radius}
        style="stroke"
        strokeWidth={RING_WIDTH}
        color={RING_COLOR}
        opacity={RING_OPACITY}
      >
        <DashPathEffect intervals={RING_DASH} />
      </Circle>
    </Canvas>
  )
}
