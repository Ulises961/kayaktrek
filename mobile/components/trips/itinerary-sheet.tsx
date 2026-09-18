import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { useMemo } from "react";
import { View } from "react-native";

import type { Day } from "@shared/dtos/day";
import { lightTokens } from "@shared/tokens";

import { PointSummaryCard } from "./point-summary-card";
import { hasConditions, WeatherSeaPanel } from "./weather-sea-panel";

// M9b3 WP2: `@gorhom/bottom-sheet` (see plans/M9b3.md's library-choice table) — a
// non-modal, persistently-docked panel, unlike the reverted `@expo/ui` prototype.
// M9l WP2 (revised): the day strip used to live in this sheet's handle; it's now
// `DayRail`, a separate bar above the map (matching web's actual layout — see
// day-rail.tsx's own comment). This sheet is purely the weather/sea panel now,
// `expanded` driven by the parent screen (day selection lives there too, since
// tapping an already-selected day in the rail toggles this sheet without the rail
// itself needing to know anything about sheet state).
// M9l WP3: a selected point swaps the body to PointSummaryCard instead — "one
// sheet, one body, swapped by selection state," the plan's own WP3 call, avoiding
// two gorhom instances fighting for the same screen edge (web solves the same
// problem by making Point a fourth tab of the same FeatureDrawer, not a second
// sheet). A point always has *something* to show (Start at minimum), so it can
// expand the sheet even on a day with no weather/sea data — canExpand is `true`
// whenever a point is selected, not just when the day has conditions.
const COLLAPSED_SNAP_POINT = "13%";
const EXPANDED_SNAP_POINT = "45%";

export function ItinerarySheet({
  selectedDay,
  selectedPointId,
  days,
  avgSpeedKnots,
  onClosePoint,
  expanded,
  onExpandedChange,
  onRefreshWeather,
}: {
  selectedDay: Day | null;
  selectedPointId: string | null;
  days: Day[];
  avgSpeedKnots: number;
  onClosePoint: () => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onRefreshWeather?: () => Promise<void>;
}) {
  const showingPoint = selectedPointId != null;
  const canExpand = showingPoint || hasConditions(selectedDay);
  // A day with no weather/sea data (and no point selected) has nothing to show
  // expanded — leaving the sheet open would strand the user looking at an empty
  // panel over the map.
  const actuallyExpanded = expanded && canExpand;

  const snapPoints = useMemo(
    () =>
      canExpand
        ? [COLLAPSED_SNAP_POINT, EXPANDED_SNAP_POINT]
        : [COLLAPSED_SNAP_POINT],
    [canExpand],
  );

  return (
    <BottomSheet
      index={actuallyExpanded ? 1 : 0}
      snapPoints={snapPoints}
      onChange={(i) => onExpandedChange(i > 0)}
      enableContentPanningGesture={canExpand}
      enableHandlePanningGesture={canExpand}
      backgroundStyle={{ backgroundColor: lightTokens.card }}
      handleIndicatorStyle={{ backgroundColor: lightTokens.border }}
      handleComponent={() => (
        <View className="items-center border-b border-border bg-card px-4 pb-2 pt-2">
          <View className="h-1 w-9 rounded-full bg-border" />
        </View>
      )}
    >
      <BottomSheetView style={{ paddingBottom: 24 }}>
        {selectedPointId ? (
          <PointSummaryCard
            pointId={selectedPointId}
            days={days}
            avgSpeedKnots={avgSpeedKnots}
            onClose={onClosePoint}
          />
        ) : (
          <WeatherSeaPanel day={selectedDay} onRefresh={onRefreshWeather} />
        )}
      </BottomSheetView>
    </BottomSheet>
  );
}
