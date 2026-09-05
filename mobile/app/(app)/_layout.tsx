import { Redirect, Stack } from "expo-router"
import { ActivityIndicator } from "react-native"

import { Screen } from "../../components/ui/layout"
import { useAuth } from "../../lib/auth/auth-context"

// Guards every route under (app) — the group is authenticated-only, matching web's
// getMe()-gated (app) shell (proxy.ts) rather than the anonymous-tolerant (public) group.
// There is no anonymous surface on mobile yet, so "unauthenticated" always sends here.
// A real Stack (not Slot) since WP3's trip detail screen needs a back button/header —
// Slot renders children with no navigation chrome at all.
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

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Your trips" }} />
      <Stack.Screen name="trips/[id]" options={{ title: "Trip" }} />
    </Stack>
  )
}
