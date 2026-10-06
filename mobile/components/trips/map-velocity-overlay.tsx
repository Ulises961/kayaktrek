import { Layers } from "lucide-react-native"
import { useMemo, useState, type ReactNode, type RefObject } from "react"
import { Pressable, StyleSheet, View } from "react-native"

import type { Day } from "@shared/dtos/day"
import { discCell } from "@shared/landing/ambient-wind"
import { lightTokens } from "@shared/tokens"
import { formatTimeAgo } from "@shared/utils/date"
import { windSpeedColor } from "@shared/weather/wind-scale"

import type { MapViewState } from "../../lib/map/project-lng-lat"
import { maskFieldToDisc } from "../../lib/weather/forecast-cell"
import { useHasCachedVelocity } from "../../lib/weather/use-has-cached-velocity"
import { useVelocityField, type VelocityKind } from "../../lib/weather/use-velocity-field"
import { meanSpeed } from "../../lib/weather/velocity-frame"
import { Text } from "../ui/text"
import { ForecastRing } from "./forecast-ring"
import { SwellOverlay } from "./swell-overlay"
import { VelocityOverlay } from "./velocity-overlay"
import { WindGradient, WindLegend } from "./wind-legend"

// Wind's look: web's planner values (map-core.tsx WIND_OPTIONS: 2.5 px lines), with the density
// raised on the device from web's 0.0016, where a phone's small screen read as sparse.
export const WIND_PARTICLE_MULTIPLIER = 0.0026
export const WIND_STROKE_WIDTH = 2.5

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`
}

function LayerSwitch({
  label,
  swatch,
  on,
  disabled,
  detail,
  onToggle,
}: {
  label: string
  /** A small mark of what the layer looks like, as on web's switches. */
  swatch: ReactNode
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
        <View className="flex-row items-center gap-2">
          {swatch}
          <Text className="text-[11px] font-medium text-foreground">{label}</Text>
        </View>
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
// Online the fields come from the server; offline, or when it cannot be reached, from what the
// last pull saved on the phone (lib/db/velocity-cache.ts), so the layers work without a
// connection. Offline they are offered only for a day that was saved, and are switched off with
// the reason otherwise. It needs a day with points: web's forecast cell is a disc around that
// day's route (`discCell`), the field is clipped to it (`maskGridToDisc`), and a dashed ring
// marks where the forecast stops — both are web's own functions, shared rather than copied.
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

  // Offline the layers draw from what the last pull saved on the phone, so they are offered only
  // for a day that was saved. `saved` is null while that is being checked, and is only asked for
  // offline: online never waits on it.
  const saved = useHasCachedVelocity(offline ? dayId : null)

  let unavailableReason: string | null = null
  if (dayId === null) unavailableReason = "Select a day to show overlays."
  else if (disc === null) unavailableReason = "This day has no points yet."
  else if (offline && saved === false) unavailableReason = "Not saved for offline use yet."
  const unavailable = unavailableReason !== null || (offline && saved === null)

  const wind = useVelocityField({ dayId, hour, kind: "wind", enabled: windOn && !unavailable, offline })
  const swell = useVelocityField({ dayId, hour, kind: "wave", enabled: swellOn && !unavailable, offline })

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
      {/* The ring marks the one forecast area, whichever of the two layers are inside it. */}
      {(windDrawn || swellDrawn) && disc && <ForecastRing disc={disc} viewRef={viewRef} size={size} />}
      {windDrawn && windField && disc && (
        <VelocityOverlay
          field={windField}
          viewRef={viewRef}
          size={size}
          color={windSpeedColor(meanSpeed(wind.field ?? windField))}
          particleMultiplier={WIND_PARTICLE_MULTIPLIER}
          strokeWidth={WIND_STROKE_WIDTH}
          disc={disc}
        />
      )}
      {/* Swell is not particles: one dash per data point, fading in place. */}
      {swellDrawn && swellField && <SwellOverlay field={swellField} viewRef={viewRef} size={size} />}

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
              swatch={
                <View testID="wind-swatch" className="overflow-hidden rounded-full">
                  <WindGradient id="wind-swatch-bar" width={16} height={6} radius={3} />
                </View>
              }
              on={windOn}
              disabled={unavailable}
              detail={detailFor(windOn, wind, windAsOf)}
              onToggle={onWindToggle}
            />
            <View className="h-px bg-border/20" />
            <LayerSwitch
              label="Swell"
              swatch={<View testID="swell-swatch" className="h-1.5 w-4 rounded-full border border-border/40 bg-white/80" />}
              on={swellOn}
              disabled={unavailable}
              detail={detailFor(swellOn, swell, swellAsOf)}
              onToggle={onSwellToggle}
            />
            <WindLegend />
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
