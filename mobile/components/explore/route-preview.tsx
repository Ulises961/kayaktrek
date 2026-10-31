import { View } from "react-native"
import Svg, { Polyline } from "react-native-svg"

import { palette } from "@shared/tokens"

// A flat SVG trace of the route, from the simplified [lat, lng] pairs the explore
// listing already carries — no map instance, no tile fetch. Same reasoning as the trip
// card's deliberate lack of a live thumbnail (the M9b2 plan WP3): N MapLibre instances
// in a scrolling list is a real performance problem, and a listing card only needs the
// route's silhouette.
const HEIGHT = 64

export function RoutePreview({ positions }: { positions: [number, number][] }) {
  // Two points are the minimum that can draw a line. One (or none) would render an
  // empty box, which reads as a failed image rather than a route with no geometry.
  if (positions.length < 2) return null

  const lats = positions.map(([lat]) => lat)
  const lngs = positions.map(([, lng]) => lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)

  // A due-north or due-east route has zero extent on one axis; dividing by it would
  // put every point at NaN and draw nothing.
  const spanLat = maxLat - minLat || 1
  const spanLng = maxLng - minLng || 1

  // Latitude grows northward and SVG's y grows downward, so y is inverted — otherwise
  // every route is drawn upside down, which is only noticeable on an asymmetric one.
  const points = positions
    .map(([lat, lng]) => {
      const x = ((lng - minLng) / spanLng) * 100
      const y = 100 - ((lat - minLat) / spanLat) * 100
      return `${x},${y}`
    })
    .join(" ")

  return (
    <View className="overflow-hidden rounded-md bg-muted" style={{ height: HEIGHT }}>
      {/* preserveAspectRatio="none" so the trace fills the card's full width at any
          aspect — this is a silhouette, not a map, so geographic proportion is not
          something the card is claiming to preserve. */}
      <Svg width="100%" height={HEIGHT} viewBox="0 0 100 100" preserveAspectRatio="none">
        <Polyline
          points={points}
          fill="none"
          stroke={palette.ocean500}
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </Svg>
    </View>
  )
}
