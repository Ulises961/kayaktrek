import "../global.css"

import { Slot } from "expo-router"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { SafeAreaProvider } from "react-native-safe-area-context"

// M9e WP0 spike: registers the background location task before any fix can arrive.
import "../lib/spike/location-task"
import { AuthProvider } from "../lib/auth/auth-context"
import { QueuedChangesProvider } from "../lib/db/queued-changes-provider"
import { CachedSurfacesProvider } from "../lib/network/cached-surfaces"

// Root layout — the one place `global.css` (NativeWind's stylesheet) is imported, and the
// one place SafeAreaProvider wraps the tree (react-native-safe-area-context; see the note
// in components/ui/layout.tsx's Screen — this is "where that call gets made for real").
// AuthProvider wraps everything below it because both route groups ((auth) and (app)) read
// auth status: (auth)/login redirects away once signed in, (app)/_layout redirects to
// login when signed out.
// GestureHandlerRootView wraps everything — without it, multi-touch gestures (MapLibre's
// pinch-to-zoom) silently fail on Android while single-finger pan still works through the
// plain touch responder system, which is exactly the "can scroll but can't zoom" symptom
// this fixes. react-native-gesture-handler was already a transitive dependency (reanimated
// pulls it in) but nothing ever rooted it.
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Screens report what they show from the cache; the offline banner
            each Screen renders (components/ui/layout.tsx) is where it is said. */}
        <CachedSurfacesProvider>
          {/* Changes made offline and waiting to send (M9d): every Screen's
              notice and the drawer's sign-out read it. */}
          <QueuedChangesProvider>
            <AuthProvider>
              <Slot />
            </AuthProvider>
          </QueuedChangesProvider>
        </CachedSurfacesProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
