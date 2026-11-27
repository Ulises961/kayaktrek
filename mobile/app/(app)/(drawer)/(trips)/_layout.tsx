import { Stack } from "expo-router"

import { stackScreenOptions } from "@mobile/lib/navigation-theme"

// Bare Stack, no Stack.Screen children — file-based routing already auto-registers
// index.tsx, trips/new.tsx and the trip's own navigator (trips/[id]/_layout.tsx); each
// screen sets its own title from inside its own file (see (app)/_layout.tsx's comment on
// why redeclaring one here would duplicate-register it). This group is one of
// (drawer)/_layout.tsx's Drawer items (M9i WP0) — its own Stack lets the trip list push to
// a trip while staying inside the "Trips" drawer item.
//
// A trip draws its own header (the tabs' TripTabBar, and a nested Stack for what opens from
// them), so this Stack shows none for it — otherwise the trip would sit under two headers.
export default function TripsStackLayout() {
  return (
    <Stack
      screenOptions={({ route }) => ({
        ...stackScreenOptions,
        headerShown: route.name !== "trips/[id]",
      })}
    />
  )
}
