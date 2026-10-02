import type { RefObject } from "react"
import { StyleSheet, View } from "react-native"

import type { Day } from "@shared/dtos/day"
import { formatTimeAgo } from "@shared/utils/date"

import type { MapViewState } from "../../lib/map/project-lng-lat"
import { useVelocityField, type VelocityKind } from "../../lib/weather/use-velocity-field"
import { meanSpeed } from "../../lib/weather/velocity-frame"
import { speedColor, type SpeedColorStop } from "../../lib/weather/advection"
import { Chip } from "../ui/chip"
import { Text } from "../ui/text"
import { VelocityOverlay } from "./velocity-overlay"

// Wave height stands in for speed on the swell field (backend: 1 m of wave is drawn as
// 1 m/s), so this ramp runs from pale to deep blue over wave heights, not wind speeds.
const SWELL_PALETTE: SpeedColorStop[] = [
  { speed: 0, color: [150, 200, 240] },
  { speed: 1, color: [70, 140, 220] },
  { speed: 3, color: [30, 80, 190] },
  { speed: 6, color: [20, 40, 140] },
]

const LAYER_NAME: Record<VelocityKind, string> = { wind: "wind", wave: "swell" }

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`
}

// M35: the wind/swell layer's controls, status line and drawing, in one piece so the
// itinerary screen only owns the choices (which layer, which hour) that the weather
// sheet also needs to see. The overlay is online-only — velocity grids are not in the
// sync cache — and is switched off with the reason rather than left showing a field it
// cannot refresh. While it shows, it carries the same "forecast as of" age the weather
// panel does: a moving field reads as live, and must not.
export function MapVelocityOverlay({
  day,
  kind,
  onKindChange,
  hour,
  viewRef,
  size,
  offline,
}: {
  day: Day | null
  kind: VelocityKind | null
  onKindChange: (kind: VelocityKind | null) => void
  hour: number
  viewRef: RefObject<MapViewState | null>
  size: { width: number; height: number }
  offline: boolean
}) {
  const dayId = day?.id ?? null
  const unavailable = offline || dayId === null
  const { status, field, error } = useVelocityField({
    dayId,
    hour,
    // The hook ignores `kind` while disabled; "wind" is just a placeholder then.
    kind: kind ?? "wind",
    enabled: kind !== null && !unavailable,
  })

  const asOf = day?.weather?.fetchedAt ?? day?.sea?.recordedAt ?? null
  const name = kind ? LAYER_NAME[kind] : null

  let statusLine: string | null = null
  if (offline) statusLine = "The overlay needs a connection."
  else if (dayId === null) statusLine = "Select a day to show wind or swell."
  else if (kind && status === "loading") statusLine = `Loading ${name}…`
  else if (kind && status === "empty") statusLine = `No ${name} forecast for this day.`
  else if (kind && status === "error") statusLine = error
  else if (kind && status === "ready") {
    statusLine = `${name?.[0].toUpperCase()}${name?.slice(1)} · ${hourLabel(hour)} · forecast as of ${formatTimeAgo(asOf)}`
  }

  const colour = field
    ? speedColor(meanSpeed(field), kind === "wave" ? SWELL_PALETTE : undefined)
    : null

  function toggle(layer: VelocityKind) {
    onKindChange(kind === layer ? null : layer)
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {kind && status === "ready" && field && colour && (
        <VelocityOverlay
          field={field}
          viewRef={viewRef}
          size={size}
          color={colour}
          // Web's planner values (map-core.tsx): swell is sparser and thicker than wind.
          particleMultiplier={kind === "wave" ? 0.0014 : 0.0016}
          strokeWidth={kind === "wave" ? 3.5 : 2.5}
        />
      )}

      <View pointerEvents="box-none" className="absolute right-3 top-16 items-end gap-1">
        <View className="flex-row gap-2">
          {(["wind", "wave"] as const).map((layer) => (
            <Chip
              key={layer}
              active={kind === layer}
              disabled={unavailable}
              onPress={() => toggle(layer)}
              accessibilityRole="button"
              accessibilityLabel={`Show ${LAYER_NAME[layer]} on the map`}
              accessibilityState={{ selected: kind === layer, disabled: unavailable }}
              className="px-3 py-1"
              textClassName="text-xs"
            >
              {layer === "wind" ? "Wind" : "Swell"}
            </Chip>
          ))}
        </View>

        {statusLine && (
          <View className="max-w-64 rounded-md bg-card/90 px-2 py-1">
            <Text className="text-[11px] text-foreground">{statusLine}</Text>
            {kind && status === "ready" && (
              <Text className="text-[10px] text-muted-foreground">
                Forecast direction and strength, the same across the whole area.
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  )
}
