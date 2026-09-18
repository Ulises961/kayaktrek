import { Stack } from "expo-router"

import { stackScreenOptions } from "@mobile/lib/navigation-theme"

// Bare Stack, no Stack.Screen children — file-based routing already auto-registers
// index.tsx and trips/[id]/{index,float-plan}.tsx; each screen sets its own title from
// inside its own file (see (app)/_layout.tsx's comment on why redeclaring one here
// would duplicate-register it). This group is one of (drawer)/_layout.tsx's Drawer
// items (M9i WP0) — its own Stack lets the trip list push to trip detail/float-plan
// while staying inside the "Trips" drawer item.
export default function TripsStackLayout() {
  return <Stack screenOptions={stackScreenOptions} />
}
