import { Navigation2, Waves } from "lucide-react-native";
import { View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";

import type { SeaState } from "@shared/dtos/sea";
import { lightTokens, palette } from "@shared/tokens";
import { formatHour } from "@shared/weather/hourly";
import { waveHeightSeverity } from "@shared/weather/beaufort";

import { Row, Stack } from "../ui/layout";
import { Text } from "../ui/text";

// Matches web's SeaGrid severity coloring (sea-grid.tsx's waveSeverityStyles).
const WAVE_COLOR: Record<ReturnType<typeof waveHeightSeverity>, string> = {
  calm: "#15803d",
  moderate: "#b45309",
  rough: "#c2410c",
  high: "#b91c1c",
};

// M9l WP4: adapts web's SeaGrid (frontend/components/weather/sea-grid.tsx)
// content onto a horizontal ScrollView — see WeatherHourGrid's own comment for
// why (no embla-carousel-react equivalent, no hour-selection sync in scope).
export function SeaHourGrid({ states }: { states: SeaState[] }) {
  if (states.length === 0) return null;

  return (
    <Stack className="gap-2">
      <Text className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Sea &amp; swell
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Row className="gap-1.5">
          {states.map((s) => (
            <View
              key={s.time}
              className="w-16 items-center gap-1 rounded-md border border-border bg-muted/30 px-1 py-1.5"
            >
              <Text className="text-[10px] tabular-nums text-muted-foreground">
                {formatHour(s.time)}
              </Text>

              <Stack className="items-center gap-0.5">
                <Row className="items-center gap-0.5">
                  <Waves size={10} color={lightTokens.mutedForeground} />
                  <Text className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                    wv
                  </Text>
                </Row>
                <Text
                  className="text-[11px] font-medium tabular-nums"
                  style={{
                    color: WAVE_COLOR[waveHeightSeverity(s.waveHeight)],
                  }}
                >
                  {s.waveHeight.toFixed(1)} m
                </Text>
                <Navigation2
                  size={10}
                  color={lightTokens.mutedForeground}
                  style={{ transform: [{ rotate: `${s.waveDirection}deg` }] }}
                />
              </Stack>

              <Stack className="w-full items-center gap-0.5 border-t border-border/50 pt-1">
                <Text
                  className="text-[8px] font-semibold uppercase tracking-wide text-ocean-600/60"
                  style={{ color: palette.ocean600 }}
                >
                  sw
                </Text>
                <Text
                  className="text-[10px] font-medium tabular-nums"
                  style={{ color: palette.ocean600 }}
                >
                  {s.swellWaveHeight != null
                    ? `${s.swellWaveHeight.toFixed(1)} m`
                    : "—"}
                </Text>
                <Text className="text-[10px] tabular-nums text-muted-foreground">
                  {s.swellPeriod != null
                    ? `${s.swellPeriod.toFixed(0)} s`
                    : "—"}
                </Text>
              </Stack>
            </View>
          ))}
        </Row>
      </ScrollView>
    </Stack>
  );
}
