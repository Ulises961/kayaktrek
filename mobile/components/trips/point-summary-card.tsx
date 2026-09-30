import {
  Anchor,
  CircleDot,
  Image as ImageIcon,
  Pencil,
  Route as RouteIcon,
  StickyNote,
  Trash2,
  X,
} from "lucide-react-native";
import { Pressable, View } from "react-native";

import type { Day } from "@shared/dtos/day";
import { lightTokens, palette } from "@shared/tokens";

import { pointLegSummary } from "@mobile/lib/itinerary/point-summary";
import { Row, Stack } from "../ui/layout";
import { Text } from "../ui/text";

// Notes/Images tiles and the pencil all navigate to the same point-detail
// screen (point/[pointId].tsx), which renders editable fields for the leader
// and read-only ones for crew — two affordances to one destination, by
// design, not duplication.
export function PointSummaryCard({
  pointId,
  days,
  avgSpeedKnots,
  onClose,
  onEdit,
  onDelete,
  onViewPoint,
}: {
  pointId: string;
  days: Day[];
  avgSpeedKnots: number;
  onClose: () => void;
  // Leader-only; absent for crew.
  onEdit?: () => void;
  onDelete?: () => void;
  // Available to every role.
  onViewPoint: () => void;
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
        <Row className="items-center gap-1">
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
          {onDelete && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete point"
              onPress={onDelete}
              hitSlop={8}
              testID="point-delete"
              className="mt-0.5 shrink-0 p-1"
            >
              <Trash2 size={16} color={lightTokens.destructive} />
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
      </Row>

      {/* items-stretch overrides Row's own items-center — without it each
          tile sizes to its own content and the three don't match heights. */}
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

        <Pressable
          disabled={!point.notes}
          onPress={() => point.notes && onViewPoint()}
          accessibilityRole={point.notes ? "button" : undefined}
          accessibilityLabel={point.notes ? "View notes" : undefined}
          testID="point-notes-tile"
          className="w-[31%] min-w-[90px] gap-1 rounded-lg border border-border px-2.5 py-2"
        >
          <Row className="items-center gap-1">
            <StickyNote size={12} color={lightTokens.mutedForeground} />
            <Text className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              Notes
            </Text>
          </Row>
          <Text
            className={
              point.notes
                ? "text-[11px] font-medium text-primary"
                : "text-[11px] italic text-muted-foreground/60"
            }
            numberOfLines={1}
          >
            {point.notes ? point.notes : "—"}
          </Text>
        </Pressable>

        <Pressable
          disabled={imageCount === 0}
          onPress={() => imageCount > 0 && onViewPoint()}
          accessibilityRole={imageCount > 0 ? "button" : undefined}
          accessibilityLabel={imageCount > 0 ? "View photos" : undefined}
          testID="point-images-tile"
          className="w-[31%] min-w-[90px] gap-1 rounded-lg border border-border px-2.5 py-2"
        >
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
        </Pressable>
      </Row>
    </Stack>
  );
}
