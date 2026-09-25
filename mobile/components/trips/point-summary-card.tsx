import {
  Anchor,
  CircleDot,
  Image as ImageIcon,
  Pencil,
  Route as RouteIcon,
  StickyNote,
  X,
} from "lucide-react-native";
import { Pressable, View } from "react-native";

import type { Day } from "@shared/dtos/day";
import { lightTokens, palette } from "@shared/tokens";

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
  onEdit,
}: {
  pointId: string;
  days: Day[];
  avgSpeedKnots: number;
  onClose: () => void;
  // The leader's way into editing this point (M9d); absent for crew.
  onEdit?: () => void;
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
        {onEdit && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit point"
            onPress={onEdit}
            hitSlop={8}
            testID="point-edit"
            className="mt-0.5 shrink-0 p-1"
          >
            <Pencil size={16} color={palette.ocean500} />
          </Pressable>
        )}
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          className="mt-0.5 shrink-0 p-1"
        >
          <X size={16} color={palette.ocean500} />
        </Pressable>
      </Row>

      {/* Icon-row micro-typography (M9b2's TripCard/LogCard convention): 12px icon,
          lightTokens.mutedForeground, 11px tabular-nums for measured values — not
          the bare uppercase-caption tiles this card started with. A visible border
          (not just a muted fill) gives each tile a defined edge at this size.
          `items-stretch` overrides Row's own `items-center` default — without it
          each tile sizes to its own content (Leg has up to 3 lines, Notes/Images
          have 1), so the three didn't match heights as siblings in the same row. */}
      <Row className="flex-wrap items-stretch gap-2">
        <View className="w-[31%] min-w-[90px] gap-1 rounded-lg border border-border px-2.5 py-2">
          <Row className="items-center gap-1">
            <RouteIcon size={12} color={lightTokens.mutedForeground} />
            <Text className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              Leg
            </Text>
          </Row>
          {leg ? (
            <>
              <Text className="text-[11px] font-medium tabular-nums">
                {leg.legText}
              </Text>
              <Text className="text-[9px] tabular-nums text-muted-foreground/70">
                {leg.totalText}
              </Text>
            </>
          ) : (
            <Text className="text-[11px] font-medium">Start</Text>
          )}
        </View>

        <View className="w-[31%] min-w-[90px] gap-1 rounded-lg border border-border px-2.5 py-2">
          <Row className="items-center gap-1">
            <StickyNote size={12} color={lightTokens.mutedForeground} />
            <Text className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              Notes
            </Text>
          </Row>
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

        <View className="w-[31%] min-w-[90px] gap-1 rounded-lg border border-border px-2.5 py-2">
          <Row className="items-center gap-1">
            <ImageIcon size={12} color={lightTokens.mutedForeground} />
            <Text className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              Images
            </Text>
          </Row>
          <Text
            className={
              imageCount > 0
                ? "text-[11px] font-medium tabular-nums text-primary"
                : "text-[11px] font-medium tabular-nums text-muted-foreground"
            }
          >
            {imageCount}
          </Text>
        </View>
      </Row>
    </Stack>
  );
}
