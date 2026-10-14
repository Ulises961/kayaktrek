import { Redirect, Slot } from "expo-router"
import { useEffect } from "react"
import { ActivityIndicator } from "react-native"

import { Screen } from "../../components/ui/layout"
import { useAuth } from "../../lib/auth/auth-context"
import { startSyncTrigger } from "../../lib/db/sync-trigger"
import { startTripChanges } from "../../lib/live/trip-changes"

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

  // The offline sweep (M9c WP7) lives here, not on a screen. It used to be
  // started by the Trip Detail hub's effect and scoped to that one trip, which
  // made what the device had offline a side effect of where its owner had
  // navigated while connected — a trip whose Itinerary tab was never opened had
  // no route cached at all. This is the one mount point every authenticated
  // route passes through, and it survives navigation between them.
  //
  // Guarded on `authenticated` because every sync call needs a token; starting
  // it while the session is still loading would just burn a sweep on 401s.
  // Mounting an effect here is unrelated to the `<Stack.Screen name=...>`
  // duplicate-registration hazard M9b documented for layouts (root CLAUDE.md) —
  // this layout registers no screens, it renders a <Slot />.
  useEffect(() => {
    if (status !== "authenticated") return
    return startSyncTrigger()
  }, [status])

  // Polls the trip's change log only while foregrounded and reachable (M36).
  useEffect(() => {
    if (status !== "authenticated") return
    return startTripChanges()
  }, [status])

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
