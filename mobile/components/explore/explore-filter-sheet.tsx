import { XIcon } from "lucide-react-native"
import { Modal, Pressable, ScrollView, View } from "react-native"

import { palette } from "@shared/tokens"

import { Button } from "../ui/button"
import { Chip } from "../ui/chip"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Row, Stack } from "../ui/layout"
import { Text } from "../ui/text"

// Web's four (frontend/components/explore/explore-discovery.tsx). Not derived from data:
// the backend groups every route into one of these, so an empty result for a season is
// still a meaningful answer.
export const SEASONS = ["winter", "spring", "summer", "autumn"] as const

export type Bounds = {
  minMiles: string
  maxMiles: string
  minDays: string
  maxDays: string
}

// React Native's own Modal rather than @expo/ui's BottomSheet. @expo/ui is in
// package.json but has never been imported by any screen — the M9b3 prototype that
// introduced it was reverted — so nothing proves the installed dev client carries its
// native code, and a filter panel is not worth a rebuild to find out. Modal is core RN
// and the modal presentation is the right one here, which is the part of the tiered
// dialog convention that actually matters.
export function ExploreFilterSheet({
  visible,
  seasons,
  bounds,
  onToggleSeason,
  onChangeBound,
  onClear,
  onClose,
}: {
  visible: boolean
  seasons: string[]
  bounds: Bounds
  onToggleSeason: (season: string) => void
  onChangeBound: (key: keyof Bounds, value: string) => void
  onClear: () => void
  onClose: () => void
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* The scrim is pressable so a tap outside dismisses, matching what a sheet
          affords on both platforms. */}
      <Pressable className="flex-1 bg-black/40" onPress={onClose} />

      <View className="max-h-[80%] rounded-t-2xl bg-background p-4">
        <Row className="justify-between pb-2">
          <Text className="text-base font-semibold">Filters</Text>
          <Pressable onPress={onClose} testID="explore-filters-done" hitSlop={8}>
            <XIcon size={20} color={palette.ocean700} />
          </Pressable>
        </Row>

        <ScrollView keyboardShouldPersistTaps="handled">
          <Stack className="gap-5 pb-2">
            <Stack className="gap-2">
              <Label>Season</Label>
              <Row className="flex-wrap gap-2">
                {SEASONS.map((season) => (
                  <Chip
                    key={season}
                    active={seasons.includes(season)}
                    onPress={() => onToggleSeason(season)}
                    testID={`filter-season-${season}`}
                  >
                    {season}
                  </Chip>
                ))}
              </Row>
            </Stack>

            <Stack className="gap-2">
              <Label>Distance</Label>
              <Row className="gap-3">
                <Stack className="flex-1 gap-1">
                  <Text className="text-[11px] text-muted-foreground">Min</Text>
                  <Input
                    value={bounds.minMiles}
                    onChangeText={(value) => onChangeBound("minMiles", value)}
                    keyboardType="numeric"
                    testID="filter-min-miles"
                  />
                </Stack>
                <Stack className="flex-1 gap-1">
                  <Text className="text-[11px] text-muted-foreground">Max</Text>
                  <Input
                    value={bounds.maxMiles}
                    onChangeText={(value) => onChangeBound("maxMiles", value)}
                    keyboardType="numeric"
                    testID="filter-max-miles"
                  />
                </Stack>
              </Row>
            </Stack>

            <Stack className="gap-2">
              <Label>Days</Label>
              <Row className="gap-3">
                <Stack className="flex-1 gap-1">
                  <Text className="text-[11px] text-muted-foreground">Min</Text>
                  <Input
                    value={bounds.minDays}
                    onChangeText={(value) => onChangeBound("minDays", value)}
                    keyboardType="numeric"
                    testID="filter-min-days"
                  />
                </Stack>
                <Stack className="flex-1 gap-1">
                  <Text className="text-[11px] text-muted-foreground">Max</Text>
                  <Input
                    value={bounds.maxDays}
                    onChangeText={(value) => onChangeBound("maxDays", value)}
                    keyboardType="numeric"
                    testID="filter-max-days"
                  />
                </Stack>
              </Row>
            </Stack>

            <Button variant="outline" onPress={onClear} testID="explore-filters-clear">
              Clear filters
            </Button>
          </Stack>
        </ScrollView>
      </View>
    </Modal>
  )
}
