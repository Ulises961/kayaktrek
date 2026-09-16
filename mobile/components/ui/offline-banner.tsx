import { useState } from "react"
import { Pressable, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { WifiOff, X } from "lucide-react-native"

import { palette } from "@shared/tokens"

import { useIsOffline } from "../../lib/network/use-is-offline"
import { Text } from "./text"

// Mounted once at the app root (app/_layout.tsx) so it's visible from every screen,
// not per-screen error state — this reflects live device connectivity (useIsOffline),
// not one failed request, and stays up for as long as the device is actually offline.
// Dismissing collapses it to an icon pill rather than hiding it outright: staying
// offline is still true and the app shouldn't go quiet about it, but the full banner
// doesn't need to keep competing with the screen for the whole time there's no signal.
export function OfflineBanner() {
  const isOffline = useIsOffline()
  const [dismissed, setDismissed] = useState(false)
  const insets = useSafeAreaInsets()

  // Reconnecting resets dismissal so the next disconnect starts expanded again.
  // Adjusted during render (React's documented pattern for state derived from a
  // prop/value change) rather than an effect, which would cost an extra commit.
  const [wasOffline, setWasOffline] = useState(isOffline)
  if (isOffline !== wasOffline) {
    setWasOffline(isOffline)
    if (!isOffline) setDismissed(false)
  }

  if (!isOffline) return null

  if (dismissed) {
    return (
      <Pressable
        onPress={() => setDismissed(false)}
        accessibilityRole="button"
        accessibilityLabel="No internet connection. Tap to expand."
        className="absolute right-3 z-50 items-center justify-center rounded-full bg-sunset-500 p-2 shadow-sm"
        style={{ top: insets.top + 8 }}
      >
        <WifiOff size={16} color="#ffffff" />
      </Pressable>
    )
  }

  return (
    <View
      className="absolute inset-x-0 z-50 flex-row items-center gap-2 bg-sunset-100 px-4 py-3 shadow-sm"
      style={{ top: insets.top }}
    >
      <WifiOff size={18} color={palette.sunset600} />
      <Text className="flex-1 text-sm text-sunset-600">
        No internet connection. Some information may be out of date.
      </Text>
      <Pressable onPress={() => setDismissed(true)} accessibilityRole="button" accessibilityLabel="Dismiss">
        <X size={16} color={palette.sunset600} />
      </Pressable>
    </View>
  )
}
