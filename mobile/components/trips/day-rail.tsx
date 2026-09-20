import { Pressable, ScrollView, View } from "react-native";

import type { Day } from "@shared/dtos/day";
import { getDayColor } from "@shared/itinerary/colors";
import { formatDayDate } from "@shared/utils/date";

import { conditionsTeaser } from "./weather-sea-panel";
import { cn } from "../../lib/cn";
import { Stack } from "../ui/layout";
import { Text } from "../ui/text";

// M9l WP2 (revised): a separate bar above the map, not part of ItinerarySheet's
// bottom sheet — matching web's actual layout (frontend/components/map/day-rail.tsx
// sits above the map; the bottom FeatureDrawer holds forecast/tide content only). The
// first pass of this WP had restyled the day cards but kept them inside the sheet's
// handle, which was M9b3's own earlier decision, made before this plan's side-by-side
// reading of what web actually does. Splitting them also leaves room for what the
// sheet may need later — comparing forecasts across days, or highlighting a selected
// day's leg on the map — without fighting the day strip for the same screen edge.
export function DayRail({
  days,
  selectedDayId,
  onDayPress,
}: {
  days: Day[];
  selectedDayId: string | null;
  onDayPress: (dayId: string) => void;
}) {
  const validDays = days.filter((day) => day.id);
  if (validDays.length === 0) return null;

  return (
    <View className="border-b border-border bg-card px-4 pb-3 pt-2">
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Stack className="flex-row gap-2">
          {validDays.map((day) => (
            <DayCard
              key={day.id}
              day={day}
              active={day.id === selectedDayId}
              onPress={() => onDayPress(day.id as string)}
            />
          ))}
        </Stack>
      </ScrollView>
    </View>
  );
}

// Matches web's DayRail content (color swatch, day label, date, a conditions
// readout), sized for a phone-width horizontal strip rather than a literal port of
// its 96px column card (which also has to become a vertical rail from `md`, a
// constraint mobile never has). Point count is dropped, matching web's own
// base-breakpoint choice.
function DayCard({
  day,
  active,
  onPress,
}: {
  day: Day;
  active: boolean;
  onPress: () => void;
}) {
  const date = formatDayDate(day.date);
  const teaser = conditionsTeaser(day);
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        "w-24 gap-1 rounded-lg border px-2 py-1.5",
        active
          ? "border-primary bg-primary/10"
          : // Same surface as Chip's unselected state and the outline button. This pill
            // is a taller, two-line variant of a chip, so it follows the same rule
            // rather than being transparent against whatever sits behind the rail.
            "border-border bg-background",
      )}
    >
      <View
        testID={`day-swatch-${day.id}`}
        className="h-1 w-full rounded-full"
        style={{ backgroundColor: getDayColor(day.dayNumber) }}
      />
      <Text
        className={cn(
          "text-sm font-semibold",
          active ? "text-primary" : "text-foreground",
        )}
      >
        Day {day.dayNumber}
      </Text>
      <Text className="text-[11px] text-muted-foreground">{date}</Text>
      {teaser && (
        <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
          {teaser}
        </Text>
      )}
    </Pressable>
  );
}
