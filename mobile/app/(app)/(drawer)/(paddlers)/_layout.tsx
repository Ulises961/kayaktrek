import { Stack } from "expo-router"

import { stackScreenOptions } from "@mobile/lib/navigation-theme"

// The list is the stack's first screen, not a paddler's profile — see
// (logs)/_layout.tsx for why a group with no root index needs this.
export const unstable_settings = {
  initialRouteName: "paddlers/index",
}

// No Stack.Screen children — see (trips)/_layout.tsx's comment for why. The
// shared screenOptions carry the header's appearance only; each screen still
// sets its own title in-file.
export default function PaddlersStackLayout() {
  return <Stack screenOptions={stackScreenOptions} />
}
