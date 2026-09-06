import { Redirect, Slot } from "expo-router"
import { ActivityIndicator } from "react-native"

import { Screen } from "../../components/ui/layout"
import { useAuth } from "../../lib/auth/auth-context"

// Guards every route under (app) — the group is authenticated-only, matching web's
// getMe()-gated (app) shell (proxy.ts) rather than the anonymous-tolerant (public) group.
// There is no anonymous surface on mobile yet, so "unauthenticated" always sends here.
// Renders <Slot />, not a Stack: the matched child is (drawer)/_layout.tsx, which is
// its own navigator (a Drawer) supplying its own chrome — wrapping it in another Stack
// here would nest two navigators for no reason. This layout's only job is the auth
// gate (M9i WP0, plans/M9i.md — a drawer, not a bottom tab bar, since the destination
// count won't stay small: logs, buddies, inventory, settings, and M9j's voice-control
// affordance are all plausible top-level entries).
export default function AppLayout() {
  const { status } = useAuth()

  if (status === "loading") {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator testID="app-layout-loading" />
      </Screen>
    )
  }

  if (status === "unauthenticated") {
    return <Redirect href="/login" />
  }

  return <Slot />
}
