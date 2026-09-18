import { Stack } from "expo-router"

import { stackScreenOptions } from "@mobile/lib/navigation-theme"

// No Stack.Screen children — see (trips)/_layout.tsx's comment for why. The
// shared screenOptions carry the header's appearance only; each screen still
// sets its own title in-file.
export default function ProfileStackLayout() {
  return <Stack screenOptions={stackScreenOptions} />
}
