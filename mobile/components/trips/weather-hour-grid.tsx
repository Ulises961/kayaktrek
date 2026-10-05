import {
  Cloud,
  CloudRain,
  CloudSun,
  Navigation2,
  Sun,
} from "lucide-react-native";
import { Pressable, View } from "react-native"
import { ScrollView } from "react-native-gesture-handler";

import type { WeatherState } from "@shared/dtos/weather";
import { lightTokens, palette } from "@shared/tokens";
import { formatHour, hourOf } from "@shared/weather/hourly";
import { beaufortSeverity, knotsToBeaufort } from "@shared/weather/beaufort";

import { Row, Stack } from "../ui/layout";
import { Text } from "../ui/text";

// Matches web's BeaufortPill severity coloring (beaufort-pill.tsx) — a small
// fixed palette, not the shared --state-* tokens (those are for trip state,
// not weather force).
const FORCE_COLOR: Record<ReturnType<typeof beaufortSeverity>, string> = {
  calm: "#15803d",
  moderate: "#b45309",
  strong: "#c2410c",
  gale: "#b91c1c",
};

function CloudIcon({ cloud }: { cloud: string | null | undefined }) {
  const pct = cloud != null ? parseInt(cloud, 10) : null;
  if (pct == null || Number.isNaN(pct)) return null;
  if (pct < 25) return <Sun size={16} color={palette.sunset400} />;
  if (pct < 62)
    return <CloudSun size={16} color={lightTokens.mutedForeground} />;
  return <Cloud size={16} color={lightTokens.mutedForeground} />;
}

// M9l WP4: adapts web's WeatherGrid (frontend/components/weather/weather-grid.tsx)
// content onto a horizontal ScrollView — embla-carousel-react (web's mechanism)
// has no RN equivalent. M35 WP3 added the hour selection web has for the same
// reason (`selectedHour` + `onHourChange`, as web's WeatherGrid): the map's
// velocity overlay is drawn for one hour, and this is where it is chosen. With no
// `onHourChange` the cards are plain display, exactly as before.
export function WeatherHourGrid({
  states,
  selectedHour = null,
  onHourChange,
}: {
  states: WeatherState[];
  selectedHour?: number | null;
  onHourChange?: (hour: number) => void;
}) {
  if (states.length === 0) return null;

  return (
    <Stack className="gap-2">
      <Text className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Wind &amp; weather
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Row className="gap-1.5">
          {states.map((s) => {
            const force =
              s.windForce != null ? knotsToBeaufort(s.windForce) : null;
            const hour = hourOf(s.time);
            const selectable = onHourChange != null && hour != null;
            const selected = selectable && hour === selectedHour;
            const card = (
              <View
                className={`w-16 items-center gap-1 rounded-md border bg-muted/30 px-1 py-1.5 ${
                  selected ? "border-primary" : "border-border"
                }`}
              >
                <Text className="text-[10px] tabular-nums text-muted-foreground">
                  {formatHour(s.time)}
                </Text>
                {s.windForce != null ? (
                  <Stack className="items-center gap-0.5">
                    <Navigation2
                      size={12}
                      color={lightTokens.mutedForeground}
                      style={{
                        transform: [{ rotate: `${s.windDirection ?? 0}deg` }],
                      }}
                    />
                    <Text
                      className="text-[10px] font-semibold tabular-nums"
                      style={{
                        color: FORCE_COLOR[beaufortSeverity(force ?? 0)],
                      }}
                    >
                      {Math.round(s.windForce)} kn
                    </Text>
                  </Stack>
                ) : (
                  <Text className="text-[10px] text-muted-foreground">—</Text>
                )}
                <Stack className="mt-1 items-center gap-0.5">
                  <CloudIcon cloud={s.cloud} />
                  {s.precipitation != null && s.precipitation > 0 && (
                    <Row className="items-center gap-0.5">
                      <CloudRain size={10} color={palette.ocean500} />
                      <Text
                        className="text-[10px] tabular-nums text-ocean-500"
                        style={{ color: palette.ocean500 }}
                      >
                        {s.precipitation.toFixed(1)}
                      </Text>
                    </Row>
                  )}
                  <Text className="text-sm font-medium tabular-nums">
                    {s.temperature != null
                      ? `${Math.round(s.temperature)}°`
                      : "—"}
                  </Text>
                </Stack>
              </View>
            );
            if (!onHourChange || hour == null) return <View key={s.time}>{card}</View>;
            return (
              <Pressable
                key={s.time}
                onPress={() => onHourChange(hour)}
                accessibilityRole="button"
                accessibilityLabel={`Show ${formatHour(s.time)} on the map`}
                accessibilityState={{ selected }}
              >
                {card}
              </Pressable>
            );
          })}
        </Row>
      </ScrollView>
    </Stack>
  );
}
