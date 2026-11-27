import { Stack } from "expo-router"

import { stackScreenOptions } from "@mobile/lib/navigation-theme"

// A trip is its tabs, with the screens that open from them (a point, the route conflict,
// the float-plan details) pushed on top. The tabs draw their own header (TripTabBar); the
// pushed screens use the stack's. Nothing is declared per screen: the router registers the
// files here, and `headerShown` is decided by name so no screen is declared twice.
export default function TripStackLayout() {
  return (
    <Stack
      screenOptions={({ route }) => ({
        ...stackScreenOptions,
        headerShown: route.name !== "(tabs)",
      })}
    />
  )
}
