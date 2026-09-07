import { ChevronUp, CloudSun } from "lucide-react-native"
import { TouchableOpacity } from "react-native"

import { palette } from "@shared/tokens"

import { Text } from "../ui/text"

// M9b3 WP2: a floating handle over the map, bottom-right (opposite corner from
// `ZoomControl`'s bottom-left, so the two never collide regardless of which one's
// content changes size). Not part of `@expo/ui`'s `BottomSheet` — that component
// is isPresented/onDismiss only, with no "always visible, collapsed" resting state
// to hang a handle off of, so this is a plain persistent view that opens the modal
// sheet on tap, standing in for the docked handle a JS-driven sheet library (e.g.
// gorhom's) would provide natively. See plans/M9b3.md's library-choice table.
export function ConditionsHandle({
  teaser,
  onPress,
}: {
  teaser: string
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="absolute bottom-4 right-4 flex-row items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2"
      style={{ elevation: 2, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 3 }}
    >
      <CloudSun size={14} color={palette.ocean500} />
      <Text className="text-sm">{teaser}</Text>
      <ChevronUp size={14} color={palette.ocean500} />
    </TouchableOpacity>
  )
}
