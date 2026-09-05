import type { CameraRef } from "@maplibre/maplibre-react-native"
import type { RefObject } from "react"
import { TouchableOpacity, View } from "react-native"

import { Text } from "../ui/text"

const MIN_ZOOM = 2
const MAX_ZOOM = 18

// Deliberately shaped after the web builder's Leaflet zoom control (map-core.tsx's
// `ZoomCorner` + globals.css) rather than inventing a mobile-only look: one bordered
// card, two stacked buttons split by a hairline, bottom-left corner. Web and mobile
// should read as the same product's map, not two different ones.
export function ZoomControl({
  cameraRef,
  zoom,
}: {
  cameraRef: RefObject<CameraRef | null>
  zoom: number
}) {
  function step(delta: number) {
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta))
    cameraRef.current?.zoomTo(next, { duration: 200 })
  }

  return (
    <View
      className="absolute bottom-4 left-4 overflow-hidden rounded-md border border-border bg-card"
      style={{ elevation: 2, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 3 }}
    >
      <TouchableOpacity
        onPress={() => step(1)}
        disabled={zoom >= MAX_ZOOM}
        className="h-10 w-10 items-center justify-center border-b border-border"
      >
        <Text className={zoom >= MAX_ZOOM ? "text-lg text-muted-foreground/40" : "text-lg text-foreground"}>
          +
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => step(-1)}
        disabled={zoom <= MIN_ZOOM}
        className="h-10 w-10 items-center justify-center"
      >
        <Text className={zoom <= MIN_ZOOM ? "text-lg text-muted-foreground/40" : "text-lg text-foreground"}>
          −
        </Text>
      </TouchableOpacity>
    </View>
  )
}
