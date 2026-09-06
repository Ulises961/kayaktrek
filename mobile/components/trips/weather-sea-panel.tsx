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
export function WeatherSeaPanel({ day }: { day: Day | null }) {
  if (!day || (!day.weather && !day.sea)) return null

  const weatherNow = representativeHour(day.weather?.weatherStates ?? undefined)
  const seaNow = representativeHour(day.sea?.seaStates ?? undefined)
  const sea = day.sea

  if (!weatherNow && !seaNow && !sea) return null

  return (
    <Stack className="gap-2 border-b border-border bg-card px-4 py-3">
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
