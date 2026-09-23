import { Stack } from "expo-router"

import { stackScreenOptions } from "@mobile/lib/navigation-theme"

// The library is the stack's first screen, not a route's detail — see
// (logs)/_layout.tsx for why a group with no root index needs this.
export const unstable_settings = {
  initialRouteName: "explore/index",
}

// No Stack.Screen children — see (trips)/_layout.tsx's comment for why. The
// shared screenOptions carry the header's appearance only; each screen still
// sets its own title in-file.
export default function ExploreStackLayout() {
  return <Stack screenOptions={stackScreenOptions} />
}
