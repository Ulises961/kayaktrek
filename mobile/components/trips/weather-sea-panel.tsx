import type { Day } from "../../../frontend/lib/dtos/day"
import { formatHour, representativeHour } from "../../../frontend/lib/weather/hourly"

import { Row, Stack } from "../ui/layout"
import { Text } from "../ui/text"

// WP5 (plans/M9b.md): pure display, no rule-of-twelfths interactivity — the web
// builder's tidal-gate calculator is explicitly out of scope for this milestone.
// One representative hourly reading per condition, same convention the web day
// strip/feature-drawer chips use (representativeHour prefers midday).
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
            <Text className="text-sm text-muted-foreground">
              Wind {Math.round(weatherNow.windForce)} kn
              {weatherNow.windDirection != null ? ` @ ${Math.round(weatherNow.windDirection)}°` : ""}
            </Text>
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
          <Text className="text-sm text-muted-foreground">
            Waves {seaNow.waveHeight.toFixed(1)} m @ {Math.round(seaNow.waveDirection)}°
          </Text>
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
            <Text className="text-sm text-muted-foreground">HW {formatHour(sea.highTide)}</Text>
          )}
          {sea.lowTide && (
            <Text className="text-sm text-muted-foreground">LW {formatHour(sea.lowTide)}</Text>
          )}
          {sea.tidalRangeM != null && (
            <Text className="text-sm text-muted-foreground">Range {sea.tidalRangeM.toFixed(1)} m</Text>
          )}
        </Row>
      )}
    </Stack>
  )
}
