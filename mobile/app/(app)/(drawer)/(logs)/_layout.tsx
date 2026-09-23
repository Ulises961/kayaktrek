import { Stack } from "expo-router"

import { stackScreenOptions } from "@mobile/lib/navigation-theme"

// The list screen is the stack's first screen. With no index at this group's
// root (it lives at logs/index, so the URL is /logs), the stack otherwise fell
// back to its first child route — `new` — and the drawer's Logs item opened
// "New log" with no list behind it and no back arrow (found on a device).
// __tests__/routes.test.ts guards every drawer group for this.
export const unstable_settings = {
  initialRouteName: "logs/index",
}

// No Stack.Screen children — see (trips)/_layout.tsx's comment for why. The
// shared screenOptions carry the header's appearance only; each screen still
// sets its own title in-file.
export default function LogsStackLayout() {
  return <Stack screenOptions={stackScreenOptions} />
}
