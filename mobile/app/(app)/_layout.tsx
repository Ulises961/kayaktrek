import { Redirect, Stack } from "expo-router"
import { ActivityIndicator } from "react-native"

import { Screen } from "../../components/ui/layout"
import { useAuth } from "../../lib/auth/auth-context"

// Guards every route under (app) — the group is authenticated-only, matching web's
// getMe()-gated (app) shell (proxy.ts) rather than the anonymous-tolerant (public) group.
// There is no anonymous surface on mobile yet, so "unauthenticated" always sends here.
// A real Stack (not Slot) since WP3's trip detail screen needs a back button/header —
// Slot renders children with no navigation chrome at all. Left bare (no per-route
// Stack.Screen children): file-based routing already auto-registers every screen, and
// redeclaring one here duplicates it ("[Layout children]: ... is extraneous", React
// Navigation's warning for exactly this) which silently breaks navigation to it. Each
// screen sets its own title via a `<Stack.Screen options={...} />` in its own file.
export default function AppLayout() {
  const { status } = useAuth()

  if (status === "loading") {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator />
      </Screen>
    )
  }

  if (status === "unauthenticated") {
    return <Redirect href="/login" />
  }

  return <Stack />
}
