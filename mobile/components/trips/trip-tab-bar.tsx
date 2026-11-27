import {
  AnchorIcon,
  ChevronLeftIcon,
  ClipboardListIcon,
  MapPinIcon,
  PackageIcon,
  RadioIcon,
  UsersIcon,
} from "lucide-react-native"
import { useRouter } from "expo-router"
import { useState } from "react"
import { Pressable, ScrollView, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { TRIP_STATE } from "@shared/dtos/trip"
import { palette } from "@shared/tokens"
import { todayIso } from "@shared/utils/date"

import { cn } from "../../lib/cn"
import { useQueuedChanges } from "../../lib/network/queued-changes"
import { pendingTripChanges } from "../../lib/trips/pending-trip-changes"
import { useTripHeaderEdit } from "../../lib/trips/trip-header-edit"
import { useTripHeader } from "../../lib/trips/use-trip-header"
import { Row } from "../ui/layout"
import { Text } from "../ui/text"
import { EditModeButton } from "./edit-mode-button"
import { TripActionsSheet, offersTripActions } from "./trip-actions-sheet"
import { TripHeader } from "./trip-header"

// The trip's sections in web's order (M40). `route` is the file under `(tabs)/`; the
// itinerary is the trip's index, as it is on web.
const SECTIONS = [
  { route: "live", label: "Live", Icon: RadioIcon },
  { route: "index", label: "Itinerary", Icon: MapPinIcon },
  { route: "crew", label: "Crew", Icon: UsersIcon },
  { route: "float-plan", label: "Float plan", Icon: AnchorIcon },
  { route: "logistics", label: "Logistics", Icon: ClipboardListIcon },
  { route: "items", label: "Items", Icon: PackageIcon },
] as const

// The tab bar's own props, reduced to what this reads: the navigator passes more, and
// anything it passes fits. Kept structural so this does not depend on the navigator's types.
type TripTabBarProps = {
  tripId: string
  state: { routes: { key: string; name: string }[]; index: number }
  navigation: { navigate: (routeName: string) => void }
}

// The bar over every tab of a trip (M43): the header, then a strip to move between sections.
// The navigator renders this at the top of its layout in place of its own bar, and the
// screens sit beneath it. Owning the trip's header data here means one fetch serves the
// header, the ••• sheet and the Live tab's presence, instead of one per tab.
export function TripTabBar({ tripId, state, navigation }: TripTabBarProps) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { pending } = useQueuedChanges()
  const { trip, isLeader, reload } = useTripHeader(tripId)
  const { action: edit } = useTripHeaderEdit()
  const [actionsOpen, setActionsOpen] = useState(false)

  const focused = state.routes[state.index]?.name
  const registered = new Set(state.routes.map((route) => route.name))
  const sections = SECTIONS.filter(
    ({ route }) =>
      registered.has(route) && (route !== "live" || trip?.state === TRIP_STATE.HAPPENING),
  )

  const canAct =
    trip !== null &&
    offersTripActions({
      isLeader,
      state: trip.state,
      hasUnsentChange: pendingTripChanges(tripId, pending).length > 0,
    })

  function goBack() {
    if (router.canGoBack()) router.back()
    else router.replace("/")
  }

  return (
    <View style={{ paddingTop: insets.top }} className="bg-background">
      {trip ? (
        <TripHeader
          tripId={tripId}
          trip={trip}
          today={todayIso()}
          // The itinerary hands the rest of the height to its map.
          compact={focused === "index"}
          onBack={goBack}
          onOpenActions={canAct ? () => setActionsOpen(true) : null}
          trailing={
            edit && <EditModeButton editing={edit.editing} onToggle={edit.onToggle} />
          }
        />
      ) : (
        <Row className="h-11 items-center px-2">
          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel="Back to trips"
            hitSlop={8}
            className="h-11 w-9 items-center justify-center"
            testID="trip-back"
          >
            <ChevronLeftIcon size={22} color={palette.ocean700} />
          </Pressable>
        </Row>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="grow-0 border-b border-border"
        contentContainerClassName="px-2"
      >
        {sections.map(({ route, label, Icon }) => {
          const selected = route === focused
          return (
            <Pressable
              key={route}
              onPress={() => navigation.navigate(route)}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              className={cn(
                "h-11 flex-row items-center gap-1.5 border-b-2 px-3",
                selected ? "border-primary" : "border-transparent",
              )}
            >
              <Icon size={16} color={selected ? palette.ocean700 : palette.ocean900} />
              <Text className={cn("text-sm", selected ? "font-semibold" : "font-medium")}>{label}</Text>
            </Pressable>
          )
        })}
      </ScrollView>

      {trip && (
        <TripActionsSheet
          visible={actionsOpen}
          tripId={tripId}
          trip={trip}
          onClose={() => setActionsOpen(false)}
          onStarted={() => void reload()}
        />
      )}
    </View>
  )
}
