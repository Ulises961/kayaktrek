import { useState } from "react";
import { ActivityIndicator } from "react-native";
import {
  ArrowDownFromLine,
  ArrowUpFromLine,
  RefreshCw,
} from "lucide-react-native";

import type { Day } from "@shared/dtos/day";
import { lightTokens } from "@shared/tokens";
import { formatTimeAgo } from "@shared/utils/date";
import { formatHour, representativeHour } from "@shared/weather/hourly";

import { refreshDayWeather } from "../../lib/trips/actions";
import { Button } from "../ui/button";
import { Row, Stack } from "../ui/layout";
import { Text } from "../ui/text";
import { SeaHourGrid } from "./sea-hour-grid";
import { WeatherHourGrid } from "./weather-hour-grid";

// WP5 (plans/M9b.md): pure display, no rule-of-twelfths interactivity — the web
// builder's tidal-gate calculator is explicitly out of scope for this milestone.
// One representative hourly reading per condition, same convention the web day
// strip/feature-drawer chips use (representativeHour prefers midday).
// M9b2 WP4: icons per metric row — lucide-react-native 1.41 dropped the plain
// `Waves` export web's lucide-react still has; `WavesHorizontal` is the closest
// equivalent, not a substitute for a shared icon (there is no shared icon set
// between the two workspaces, only shared color tokens).
// M9b3 WP2: this is now `ItinerarySheet`'s body (`@gorhom/bottom-sheet`), not an
// inline panel docked between the day strip and the map — dropped `border-b`/
// `bg-card` (a lone bottom border reads as a stray rule with nothing below it
// inside a sheet, and the sheet paints its own background via `backgroundStyle`).
export function hasConditions(day: Day | null): boolean {
  return Boolean(day && (day.weather || day.sea));
}

// Short label shown on the sheet's collapsed day-strip handle (`ItinerarySheet`) —
// same "representative hour" selection as the panel body, condensed to one line.
// Returns null on the same conditions `WeatherSeaPanel` itself would render nothing
// for, so a caller never shows a teaser promising detail there isn't any.
export function conditionsTeaser(day: Day | null): string | null {
  if (!hasConditions(day)) return null;
  const weatherNow = representativeHour(
    day?.weather?.weatherStates ?? undefined,
  );
  const seaNow = representativeHour(day?.sea?.seaStates ?? undefined);
  if (!weatherNow && !seaNow) return null;

  const parts: string[] = [];
  if (weatherNow?.temperature != null)
    parts.push(`${Math.round(weatherNow.temperature)}°C`);
  if (weatherNow?.windForce != null)
    parts.push(`${Math.round(weatherNow.windForce)} kn`);
  if (seaNow?.waveHeight != null)
    parts.push(`${seaNow.waveHeight.toFixed(1)} m`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

// M9c WP5 (plans/M9c.md, docs/mobile/sync-protocol-spec.md §6.4): device-initiated
// refresh, gated by `PremiumEntitlementService` on the backend — a closed-by-default
// self-hosted stub, so a 403 here is an expected outcome, not a failure state.
// `refreshDayWeather` only queues the refetch; it carries no completion signal, so
// `onRefresh` (the caller's re-pull, live or cached) is awaited right after it and is
// the caller's job to time appropriately for its own data source.
export function WeatherSeaPanel({
  day,
  onRefresh,
  selectedHour,
  onHourChange,
}: {
  day: Day | null;
  onRefresh?: () => Promise<void>;
  // M35 WP3: the hour the map's velocity overlay is drawn for, chosen from either
  // hourly grid. Without `onHourChange` the grids are plain display.
  selectedHour?: number | null;
  onHourChange?: (hour: number) => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  if (!hasConditions(day)) return null;

  const weatherNow = representativeHour(
    day?.weather?.weatherStates ?? undefined,
  );
  const seaNow = representativeHour(day?.sea?.seaStates ?? undefined);
  const sea = day?.sea;

  if (!weatherNow && !seaNow && !sea) return null;

  // "Forecast as of …" is mandatory whenever weather/sea renders (spec §6.3) — never
  // let cached data appear indistinguishable from live data. Weather's `fetchedAt` and
  // Sea's `recordedAt` are bumped together by the same refresh, so either stands in for
  // "when was this trip's conditions data last fetched" when the other is absent.
  const asOf = day?.weather?.fetchedAt ?? day?.sea?.recordedAt ?? null;

  async function handleRefresh() {
    if (!day?.id) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      await refreshDayWeather(day.id);
      await onRefresh?.();
    } catch (err) {
      setRefreshError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Stack className="gap-3 px-4 py-4">
      <Row className="items-center justify-between">
        <Text className="text-xs text-muted-foreground">
          Forecast as of {formatTimeAgo(asOf)}
        </Text>
        {onRefresh && day?.id && (
          <Button
            variant="ghost"
            size="icon-sm"
            accessibilityLabel="Refresh forecast"
            disabled={refreshing}
            onPress={() => void handleRefresh()}
          >
            {refreshing ? (
              <ActivityIndicator
                size="small"
                color={lightTokens.mutedForeground}
              />
            ) : (
              <RefreshCw size={14} color={lightTokens.mutedForeground} />
            )}
          </Button>
        )}
      </Row>

      {refreshError && (
        <Text className="text-xs text-muted-foreground">{refreshError}</Text>
      )}

      {/* M9l WP4: the full hourly series, not just one representative hour — this
          plan's own analysis had wrongly deferred these as if they were the
          TidalEntryForm/RuleOfTwelfthsTable editing widgets, when they're pure
          display (see plans/M9l.md's corrected table row). */}
      <WeatherHourGrid
        states={day?.weather?.weatherStates ?? []}
        selectedHour={selectedHour}
        onHourChange={onHourChange}
      />
      <SeaHourGrid
        states={day?.sea?.seaStates ?? []}
        selectedHour={selectedHour}
        onHourChange={onHourChange}
      />

      {sea && (sea.highTide || sea.lowTide) && (
        <Row className="flex-wrap gap-x-4 gap-y-1">
          {sea.highTide && (
            <Row className="items-center gap-1">
              <ArrowUpFromLine size={13} color={lightTokens.mutedForeground} />
              <Text className="text-sm text-muted-foreground">
                {formatHour(sea.highTide)}
              </Text>
            </Row>
          )}
          {sea.lowTide && (
            <Row className="items-center gap-1">
              <ArrowDownFromLine
                size={13}
                color={lightTokens.mutedForeground}
              />
              <Text className="text-sm text-muted-foreground">
                {formatHour(sea.lowTide)}
              </Text>
            </Row>
          )}
          {sea.tidalRangeM != null && (
            <Text className="text-sm text-muted-foreground">
              Range {sea.tidalRangeM.toFixed(1)} m
            </Text>
          )}
        </Row>
      )}
    </Stack>
  );
}
