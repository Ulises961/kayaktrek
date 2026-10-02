import { Layers } from "lucide-react-native"
import { useMemo, useState, type RefObject } from "react"
import { Pressable, StyleSheet, View } from "react-native"

import type { Day } from "@shared/dtos/day"
import { discCell } from "@shared/landing/ambient-wind"
import { lightTokens } from "@shared/tokens"
import { formatTimeAgo } from "@shared/utils/date"

import type { MapViewState } from "../../lib/map/project-lng-lat"
import { speedColor } from "../../lib/weather/advection"
import { maskFieldToDisc } from "../../lib/weather/forecast-cell"
import { useVelocityField, type VelocityKind } from "../../lib/weather/use-velocity-field"
import { meanSpeed } from "../../lib/weather/velocity-frame"
import { Text } from "../ui/text"
import { VelocityOverlay } from "./velocity-overlay"

// Swell is white: direction matters more than speed, the standard chart convention, and web
// draws it the same way (map-core.tsx SWELL_OPTIONS). It is drawn as a dash, not a line: one
// fixed length (minimum and maximum the same, so it does not stretch with the flow the way
// wind's trails do) with square ends, so a wave crest moving through reads differently from
// wind streaming past.
const SWELL_COLOR = "rgb(255, 255, 255)"
const SWELL_DASH_PIXELS = 8
const SWELL_TRAIL = { minPixels: SWELL_DASH_PIXELS, maxPixels: SWELL_DASH_PIXELS }

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`
}

function LayerSwitch({
  label,
  on,
  disabled,
  detail,
  onToggle,
}: {
  label: string
  on: boolean
  disabled: boolean
  detail: string | null
  onToggle: () => void
}) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on, disabled }}
      className={`px-3 py-2 ${disabled ? "opacity-50" : ""}`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-[11px] font-medium text-foreground">{label}</Text>
        {/* Web's Toggle: a small pill with a knob. */}
        <View className={`h-4 w-7 rounded-full ${on ? "bg-primary" : "bg-muted-foreground/30"}`}>
          <View
            className="absolute top-0.5 h-3 w-3 rounded-full bg-white"
            style={{ left: on ? 14 : 2 }}
          />
        </View>
      </View>
      {detail && <Text className="mt-0.5 text-[10px] text-muted-foreground">{detail}</Text>}
    </Pressable>
  )
}

// M35: the wind/swell layers, behind a layers control as on web (layers-control.tsx): one
// button, a panel of switches, nothing else on the map. Wind and swell are independent
// and can both be on. While they show, the panel carries the same "forecast as of" age
// the weather panel does — a moving field reads as live, and must not — and says the flow
// is one reading, not a map of varying wind.
//
// The overlay is online-only (velocity grids are not in the sync cache), so it is switched
// off with the reason rather than left showing a field it cannot refresh. It needs a day
// with points: web's forecast cell is a disc around that day's route (`discCell`), the field
// is clipped to it (`maskGridToDisc`), and a dashed ring marks where the forecast stops —
// both are web's own functions, shared rather than copied.
export function MapVelocityOverlay({
  day,
  dayPositions,
  windOn,
  swellOn,
  onWindToggle,
  onSwellToggle,
  hour,
  viewRef,
  size,
  offline,
}: {
  day: Day | null
  /** The selected day's route points as [latitude, longitude], which the forecast disc is built from. */
  dayPositions: [number, number][]
  windOn: boolean
  swellOn: boolean
  onWindToggle: () => void
  onSwellToggle: () => void
  hour: number
  viewRef: RefObject<MapViewState | null>
  size: { width: number; height: number }
  offline: boolean
}) {
  const [open, setOpen] = useState(false)
  const dayId = day?.id ?? null
  const disc = useMemo(() => (dayPositions.length > 0 ? discCell(dayPositions) : null), [dayPositions])

  let unavailableReason: string | null = null
  if (offline) unavailableReason = "Needs a connection."
  else if (dayId === null) unavailableReason = "Select a day to show overlays."
  else if (disc === null) unavailableReason = "This day has no points yet."
  const unavailable = unavailableReason !== null

  const wind = useVelocityField({ dayId, hour, kind: "wind", enabled: windOn && !unavailable })
  const swell = useVelocityField({ dayId, hour, kind: "wave", enabled: swellOn && !unavailable })

  // Clipped to the disc once per field, so the overlay keeps a stable `field` and does not
  // restart its particles on every render.
  const windField = useMemo(
    () => (wind.field && disc ? maskFieldToDisc(wind.field, disc.center, disc.radiusKm) : null),
    [wind.field, disc],
  )
  const swellField = useMemo(
    () => (swell.field && disc ? maskFieldToDisc(swell.field, disc.center, disc.radiusKm) : null),
    [swell.field, disc],
  )

  const windDrawn = windOn && wind.status === "ready" && windField !== null
  const swellDrawn = swellOn && swell.status === "ready" && swellField !== null

  const windAsOf = day?.weather?.fetchedAt ?? day?.sea?.recordedAt ?? null
  const swellAsOf = day?.sea?.recordedAt ?? day?.weather?.fetchedAt ?? null

  function detailFor(on: boolean, state: { status: string; error: string | null }, asOf: string | null) {
    if (!on || unavailable) return null
    if (state.status === "loading") return "Loading…"
    if (state.status === "empty") return "No forecast for this day."
    if (state.status === "error") return state.error
    if (state.status === "ready") return `${hourLabel(hour)} · forecast as of ${formatTimeAgo(asOf)}`
    return null
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {windDrawn && windField && disc && (
        <VelocityOverlay
          field={windField}
          viewRef={viewRef}
          size={size}
          color={speedColor(meanSpeed(wind.field ?? windField))}
          // Web's planner values (map-core.tsx WIND_OPTIONS).
          particleMultiplier={0.0016}
          strokeWidth={2.5}
          disc={disc}
          drawRing
        />
      )}
      {swellDrawn && swellField && disc && (
        <VelocityOverlay
          field={swellField}
          viewRef={viewRef}
          size={size}
          color={SWELL_COLOR}
          // Web's planner values (map-core.tsx SWELL_OPTIONS): sparser and thicker than wind.
          particleMultiplier={0.0014}
          strokeWidth={3.5}
          strokeCap="butt"
          trail={SWELL_TRAIL}
          disc={disc}
          drawRing={!windDrawn}
        />
      )}

      <View pointerEvents="box-none" className="absolute right-3 top-3 items-end gap-1">
        <Pressable
          onPress={() => setOpen((wasOpen) => !wasOpen)}
          accessibilityRole="button"
          accessibilityLabel="Map overlays"
          accessibilityState={{ expanded: open }}
          className={`rounded-md bg-card/90 p-2 ${open ? "border border-primary/50" : "border border-border/40"}`}
        >
          <Layers size={16} color={lightTokens.foreground} />
        </Pressable>

        {open && (
          <View className="w-48 overflow-hidden rounded-md border border-border/30 bg-card">
            <View className="border-b border-border/30 px-3 py-1.5">
              <Text className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                Map overlays
              </Text>
            </View>
            <LayerSwitch
              label="Wind"
              on={windOn}
              disabled={unavailable}
              detail={detailFor(windOn, wind, windAsOf)}
              onToggle={onWindToggle}
            />
            <View className="h-px bg-border/20" />
            <LayerSwitch
              label="Swell"
              on={swellOn}
              disabled={unavailable}
              detail={detailFor(swellOn, swell, swellAsOf)}
              onToggle={onSwellToggle}
            />
            <View className="border-t border-border/30 px-3 py-1.5">
              {unavailableReason && (
                <Text className="mb-1 text-[10px] text-foreground">{unavailableReason}</Text>
              )}
              <Text className="text-[10px] text-muted-foreground">
                Forecast direction and strength, the same across the whole area.
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  )
}

export type { VelocityKind }
