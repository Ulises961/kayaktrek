import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet"
import { useMemo, useState } from "react"
import { Pressable, ScrollView, View } from "react-native"

import type { Day } from "@shared/dtos/day"
import { getDayColor } from "@shared/itinerary/colors"
import { lightTokens } from "@shared/tokens"
import { formatDayDate } from "@shared/utils/date"

import { conditionsTeaser, hasConditions, WeatherSeaPanel } from "./weather-sea-panel"
import { cn } from "../../lib/cn"
import { Stack } from "../ui/layout"
import { Text } from "../ui/text"

// M9b3 WP2: `@gorhom/bottom-sheet` (see plans/M9b3.md's library-choice table) — a
// non-modal, persistently-docked panel, unlike the reverted `@expo/ui` prototype. The
// day strip is the sheet's `handleComponent` (its always-visible, collapsed-state
// header), not a fixed row above the map — dragging it, or tapping a day chip,
// reveals `WeatherSeaPanel` underneath. There is deliberately no `ConditionsHandle`
// floating pill and no separate expand toggle: the day strip itself is the
// affordance, since a dedicated chevron next to it duplicated the handle's own
// drag-to-expand gesture.
const COLLAPSED_SNAP_POINT = "13%"
const EXPANDED_SNAP_POINT = "45%"

export function ItinerarySheet({
  days,
  selectedDayId,
  onSelectDay,
  selectedDay,
  onRefreshWeather,
}: {
  days: Day[]
  selectedDayId: string | null
  onSelectDay: (id: string | null) => void
  selectedDay: Day | null
  onRefreshWeather?: () => Promise<void>
}) {
  const [expandRequested, setExpandRequested] = useState(false)
  const canExpand = hasConditions(selectedDay)
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

  function handleDayPress(dayId: string) {
    if (dayId === selectedDayId) {
      setExpandRequested((v) => !v)
      return
    }
    onSelectDay(dayId)
    setExpandRequested(true)
  }

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
        <SheetHandle days={days} selectedDayId={selectedDayId} onDayPress={handleDayPress} />
      )}
    >
      <BottomSheetView style={{ paddingBottom: 24 }}>
        <WeatherSeaPanel day={selectedDay} onRefresh={onRefreshWeather} />
      </BottomSheetView>
    </BottomSheet>
  )
}

function SheetHandle({
  days,
  selectedDayId,
  onDayPress,
}: {
  days: Day[]
  selectedDayId: string | null
  onDayPress: (dayId: string) => void
}) {
  return (
    <View className="border-b border-border bg-card px-4 pb-3 pt-2">
      <View className="mb-2 h-1 w-9 self-center rounded-full bg-border" />
      {days.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Stack className="flex-row gap-2">
            {days
              .filter((day) => day.id)
              .map((day) => (
                <DayCard
                  key={day.id}
                  day={day}
                  active={day.id === selectedDayId}
                  onPress={() => onDayPress(day.id as string)}
                />
              ))}
          </Stack>
        </ScrollView>
      )}
    </View>
  )
}

// M9l WP2: replaces the plain "Day N" Chip with a richer card — color swatch, date,
// conditions teaser — matching web's DayRail content (frontend/components/map/day-rail.tsx),
// sized for a phone-width horizontal strip rather than a literal port of its 96px column
// card (which also has to become a vertical rail from `md`, a constraint mobile never has).
// Point count is dropped, matching web's own base-breakpoint choice, not an oversight.
function DayCard({
  day,
  active,
  onPress,
}: {
  day: Day
  active: boolean
  onPress: () => void
}) {
  const date = formatDayDate(day.date)
  const teaser = conditionsTeaser(day)
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        "w-24 gap-1 rounded-lg border px-2 py-1.5",
        active ? "border-primary bg-primary/10" : "border-border bg-transparent",
      )}
    >
      <View
        testID={`day-swatch-${day.id}`}
        className="h-1 w-full rounded-full"
        style={{ backgroundColor: getDayColor(day.dayNumber) }}
      />
      <Text className={cn("text-sm font-semibold", active ? "text-primary" : "text-foreground")}>
        Day {day.dayNumber}
      </Text>
      <Text className="text-[11px] text-muted-foreground">{date}</Text>
      {teaser && (
        <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
          {teaser}
        </Text>
      )}
    </Pressable>
  )
}
