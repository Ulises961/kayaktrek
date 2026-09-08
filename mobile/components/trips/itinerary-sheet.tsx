import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet"
import { ChevronDown, ChevronUp } from "lucide-react-native"
import { useMemo, useState } from "react"
import { ScrollView, TouchableOpacity, View } from "react-native"

import type { Day } from "@shared/dtos/day"
import { lightTokens, palette } from "@shared/tokens"

import { conditionsTeaser, hasConditions, WeatherSeaPanel } from "./weather-sea-panel"
import { Chip } from "../ui/chip"
import { Row, Stack } from "../ui/layout"
import { Text } from "../ui/text"

// M9b3 WP2: `@gorhom/bottom-sheet` (see plans/M9b3.md's library-choice table) — a
// non-modal, persistently-docked panel, unlike the reverted `@expo/ui` prototype. The
// day strip is the sheet's `handleComponent` (its always-visible, collapsed-state
// header), not a fixed row above the map — dragging or tapping it reveals
// `WeatherSeaPanel` underneath. There is deliberately no `ConditionsHandle` floating
// pill anymore: the day strip itself is now that affordance.
const COLLAPSED_SNAP_POINT = "13%"
const EXPANDED_SNAP_POINT = "45%"

export function ItinerarySheet({
  days,
  selectedDayId,
  onSelectDay,
  selectedDay,
}: {
  days: Day[]
  selectedDayId: string | null
  onSelectDay: (id: string | null) => void
  selectedDay: Day | null
}) {
  const [expandRequested, setExpandRequested] = useState(false)
  const canExpand = hasConditions(selectedDay)
  const teaser = conditionsTeaser(selectedDay)
  // Derived, not effect-driven: switching to a day with no weather/sea data
  // collapses the sheet automatically (there's nothing to show expanded, and
  // leaving it open would strand the user looking at an empty panel over the
  // map), and switching back to a day that has data restores whatever the user
  // last asked for.
  const expanded = expandRequested && canExpand

  const snapPoints = useMemo(
    () => (canExpand ? [COLLAPSED_SNAP_POINT, EXPANDED_SNAP_POINT] : [COLLAPSED_SNAP_POINT]),
    [canExpand],
  )

  return (
    <BottomSheet
      index={expanded ? 1 : 0}
      snapPoints={snapPoints}
      onChange={(i) => setExpandRequested(i > 0)}
      enableContentPanningGesture={canExpand}
      enableHandlePanningGesture={canExpand}
      backgroundStyle={{ backgroundColor: lightTokens.card }}
      handleIndicatorStyle={{ backgroundColor: lightTokens.border }}
      handleComponent={() => (
        <SheetHandle
          days={days}
          selectedDayId={selectedDayId}
          onSelectDay={onSelectDay}
          teaser={teaser}
          canExpand={canExpand}
          expanded={expanded}
          onToggle={() => setExpandRequested((v) => !v)}
        />
      )}
    >
      <BottomSheetView style={{ paddingBottom: 24 }}>
        <WeatherSeaPanel day={selectedDay} />
      </BottomSheetView>
    </BottomSheet>
  )
}

function SheetHandle({
  days,
  selectedDayId,
  onSelectDay,
  teaser,
  canExpand,
  expanded,
  onToggle,
}: {
  days: Day[]
  selectedDayId: string | null
  onSelectDay: (id: string | null) => void
  teaser: string | null
  canExpand: boolean
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <View className="border-b border-border bg-card px-4 pb-3 pt-2">
      <View className="mb-2 h-1 w-9 self-center rounded-full bg-border" />
      <Row className="items-center gap-2">
        {days.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1">
            <Stack className="flex-row gap-2">
              {days.map((day) => (
                <Chip
                  key={day.id}
                  active={day.id === selectedDayId}
                  onPress={() => onSelectDay(day.id ?? null)}
                >
                  Day {day.dayNumber}
                </Chip>
              ))}
            </Stack>
          </ScrollView>
        ) : (
          <View className="flex-1" />
        )}

        {canExpand && (
          <TouchableOpacity
            onPress={onToggle}
            accessibilityRole="button"
            accessibilityLabel={expanded ? "Hide weather and sea detail" : "Show weather and sea detail"}
            className="flex-row items-center gap-1 rounded-full border border-border px-2 py-1"
          >
            {teaser && !expanded && <Text className="text-xs text-muted-foreground">{teaser}</Text>}
            {expanded ? (
              <ChevronDown size={14} color={palette.ocean500} />
            ) : (
              <ChevronUp size={14} color={palette.ocean500} />
            )}
          </TouchableOpacity>
        )}
      </Row>
    </View>
  )
}
