import { ArrowDownFromLine, ArrowUpFromLine, Wind, WavesHorizontal } from "lucide-react-native"

import type { Day } from "@shared/dtos/day"
import { palette } from "@shared/tokens"
import { formatHour, representativeHour } from "@shared/weather/hourly"

import { Row, Stack } from "../ui/layout"
import { Text } from "../ui/text"

// WP5 (plans/M9b.md): pure display, no rule-of-twelfths interactivity — the web
// builder's tidal-gate calculator is explicitly out of scope for this milestone.
// One representative hourly reading per condition, same convention the web day
// strip/feature-drawer chips use (representativeHour prefers midday).
// M9b2 WP4: icons per metric row — lucide-react-native 1.41 dropped the plain
// `Waves` export web's lucide-react still has; `WavesHorizontal` is the closest
// equivalent, not a substitute for a shared icon (there is no shared icon set
// between the two workspaces, only shared color tokens).
// M9b3 WP2: this is now a modal-sheet body (@expo/ui's BottomSheet), not an inline
// panel docked between the day strip and the map — dropped `border-b`/`bg-card`
// (a lone bottom border reads as a stray rule with nothing below it inside a
// sheet, and the sheet paints its own background via `containerColor`).
export function hasConditions(day: Day | null): boolean {
  return Boolean(day && (day.weather || day.sea))
}

// Short label for the floating handle that opens the sheet — same "representative
// hour" selection as the panel body, condensed to one line. Returns null on the
// same conditions `WeatherSeaPanel` itself would render nothing for, so a caller
// never shows a handle promising detail there isn't any.
export function conditionsTeaser(day: Day | null): string | null {
  if (!hasConditions(day)) return null
  const weatherNow = representativeHour(day?.weather?.weatherStates ?? undefined)
  const seaNow = representativeHour(day?.sea?.seaStates ?? undefined)
  if (!weatherNow && !seaNow) return null

  const parts: string[] = []
  if (weatherNow?.temperature != null) parts.push(`${Math.round(weatherNow.temperature)}°C`)
  if (weatherNow?.windForce != null) parts.push(`${Math.round(weatherNow.windForce)} kn`)
  if (seaNow) parts.push(`${seaNow.waveHeight.toFixed(1)} m`)
  return parts.length > 0 ? parts.join(" · ") : null
}

export function WeatherSeaPanel({ day }: { day: Day | null }) {
  if (!hasConditions(day)) return null

  const weatherNow = representativeHour(day?.weather?.weatherStates ?? undefined)
  const seaNow = representativeHour(day?.sea?.seaStates ?? undefined)
  const sea = day?.sea

  if (!weatherNow && !seaNow && !sea) return null

  return (
    <Stack className="gap-3 px-4 py-4">
      {weatherNow && (
        <Row className="flex-wrap gap-x-4 gap-y-1">
          <Text className="text-sm">
            {formatHour(weatherNow.time)} ·{" "}
            {weatherNow.temperature != null ? `${Math.round(weatherNow.temperature)}°C` : "—"}
          </Text>
          {weatherNow.windForce != null && (
            <Row className="items-center gap-1">
              <Wind size={13} color={palette.ocean500} />
              <Text className="text-sm text-muted-foreground">
                {Math.round(weatherNow.windForce)} kn
                {weatherNow.windDirection != null
                  ? ` @ ${Math.round(weatherNow.windDirection)}°`
                  : ""}
              </Text>
            </Row>
          )}
          {weatherNow.precipitation != null && (
            <Text className="text-sm text-muted-foreground">
              {weatherNow.precipitation.toFixed(1)} mm
            </Text>
          )}
        </Row>
      )}

      {seaNow && (
        <Row className="flex-wrap gap-x-4 gap-y-1">
          <Row className="items-center gap-1">
            <WavesHorizontal size={13} color={palette.ocean500} />
            <Text className="text-sm text-muted-foreground">
              {seaNow.waveHeight.toFixed(1)} m @ {Math.round(seaNow.waveDirection)}°
            </Text>
          </Row>
          {seaNow.swellWaveHeight != null && (
            <Text className="text-sm text-muted-foreground">
              Swell {seaNow.swellWaveHeight.toFixed(1)} m
            </Text>
          )}
        </Row>
      )}

      {sea && (sea.highTide || sea.lowTide) && (
        <Row className="flex-wrap gap-x-4 gap-y-1">
          {sea.highTide && (
            <Row className="items-center gap-1">
              <ArrowUpFromLine size={13} color={palette.ocean500} />
              <Text className="text-sm text-muted-foreground">{formatHour(sea.highTide)}</Text>
            </Row>
          )}
          {sea.lowTide && (
            <Row className="items-center gap-1">
              <ArrowDownFromLine size={13} color={palette.ocean500} />
              <Text className="text-sm text-muted-foreground">{formatHour(sea.lowTide)}</Text>
            </Row>
          )}
          {sea.tidalRangeM != null && (
            <Text className="text-sm text-muted-foreground">Range {sea.tidalRangeM.toFixed(1)} m</Text>
          )}
        </Row>
      )}
    </Stack>
  )
}
