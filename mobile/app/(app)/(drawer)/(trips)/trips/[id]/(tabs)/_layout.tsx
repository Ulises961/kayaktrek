import { Tabs, useLocalSearchParams } from "expo-router"

import { TripTabBar } from "@mobile/components/trips/trip-tab-bar"
import { TripHeaderEditProvider } from "@mobile/lib/trips/trip-header-edit"

// A trip's sections as tabs under one header (M43), so moving between them no longer means
// going back to a hub. A Tabs navigator rather than a Stack because it keeps each section
// mounted: the itinerary's map is expensive to bring up, and leaving it for Crew and coming
// back must not rebuild it. Screens are auto-registered from the files beside this one — none
// is declared here (see (app)/_layout.tsx on why redeclaring duplicates a route).
//
// `backBehavior="none"`: the system back button leaves the trip for wherever it was opened
// from, rather than stepping back through the sections visited.
export default function TripTabsLayout() {
  const { id } = useLocalSearchParams<{ id: string }>()

  return (
    // The provider is what lets the itinerary put its Edit button in the header above it.
    <TripHeaderEditProvider>
      <Tabs
        backBehavior="none"
        screenOptions={{ headerShown: false, tabBarPosition: "top" }}
        tabBar={({ state, navigation }) => (
          <TripTabBar
            tripId={id}
            state={state}
            navigation={{ navigate: (routeName) => navigation.navigate(routeName) }}
          />
        )}
      />
    </TripHeaderEditProvider>
  )
}
