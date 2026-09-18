import { Anchor, CircleDot, X } from "lucide-react-native";
import { Pressable, View } from "react-native";

import type { Day } from "@shared/dtos/day";
import { palette } from "@shared/tokens";

import { pointLegSummary } from "@mobile/lib/itinerary/point-summary";
import { Row, Stack } from "../ui/layout";
import { Text } from "../ui/text";

// M9l WP3: the selected point's summary — type, name, leg, notes, image count —
// mirroring web's PointSummary (frontend/components/map/point-detail-sheet.tsx)
// read-only tier only. No PointDetailModal equivalent (tap-to-edit) — mobile point
// editing is separately in scope via plans/M31.md's own small form, not a port of
// this card. Renders as ItinerarySheet's body while a point is selected, replacing
// WeatherSeaPanel rather than living in a second sheet — the same "one sheet, one
// body, swapped by selection state" call this plan's WP3 section made.
export function PointSummaryCard({
  pointId,
  days,
  avgSpeedKnots,
  onClose,
}: {
  pointId: string;
  days: Day[];
  avgSpeedKnots: number;
  onClose: () => void;
}) {
  const point = days
    .flatMap((day) => day.points ?? [])
    .find((p) => p.id === pointId);
  if (!point) return null;

  const leg = pointLegSummary(pointId, days, avgSpeedKnots);
  const displayName = point.name || point.type || "position";
  const imageCount = point.images?.length ?? 0;

  return (
    <Stack className="gap-3 px-4 py-4">
      <Row className="items-start justify-between">
        <View className="min-w-0 flex-1">
          <Row className="mb-0.5 items-center gap-1.5">
            {point.type === "stop" ? (
              <Anchor size={14} color={palette.ocean500} />
            ) : (
              <CircleDot size={14} color={palette.ocean500} />
            )}
            <Text className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              {point.type ?? "position"}
            </Text>
          </Row>
          <Text className="text-sm font-semibold" numberOfLines={1}>
            {displayName}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          className="mt-0.5 shrink-0 p-1"
        >
          <X size={16} color={palette.ocean500} />
        </Pressable>
      </Row>

      <Row className="flex-wrap gap-2">
        <View className="w-[31%] min-w-[90px] gap-0.5 rounded-lg bg-muted/40 px-2.5 py-2">
          <Text className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Leg
          </Text>
          {leg ? (
            <>
              <Text className="text-[11px] font-medium">{leg.legText}</Text>
              <Text className="text-[9px] text-muted-foreground/70">
                {leg.totalText}
              </Text>
            </>
          ) : (
            <Text className="text-[11px] font-medium">Start</Text>
          )}
        </View>

        <View className="w-[31%] min-w-[90px] gap-0.5 rounded-lg bg-muted/40 px-2.5 py-2">
          <Text className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Notes
          </Text>
          <Text
            className={
              point.notes
                ? "text-[11px] text-foreground"
                : "text-[11px] italic text-muted-foreground/60"
            }
            numberOfLines={1}
          >
            {point.notes ? point.notes : "—"}
          </Text>
        </View>

        <View className="w-[31%] min-w-[90px] gap-0.5 rounded-lg bg-muted/40 px-2.5 py-2">
          <Text className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Images
          </Text>
          <Text
            className={
              imageCount > 0
                ? "text-[11px] font-medium text-primary"
                : "text-[11px] font-medium text-muted-foreground"
            }
          >
            {imageCount}
          </Text>
        </View>
      </Row>
    </Stack>
  );
}
