import { useState } from "react"
import { Pressable, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { WifiOff, X } from "lucide-react-native"

import { lightTokens, palette } from "@shared/tokens"
import { formatTimeAgo } from "@shared/utils/date"

import { type CachedSurfaceReport, useCachedSurfaces } from "../../lib/network/cached-surfaces"
import { useIsOffline } from "../../lib/network/use-is-offline"
import { Text } from "./text"

// Mounted once at the app root (app/_layout.tsx) so it's visible from every screen,
// not per-screen error state — this reflects live device connectivity (useIsOffline),
// not one failed request, and stays up for as long as the device is actually offline.
// Dismissing collapses it to an icon pill rather than hiding it outright: staying
// offline is still true and the app shouldn't go quiet about it, but the full banner
// doesn't need to keep competing with the screen for the whole time there's no signal.
//
// It also carries what the focused screen is showing from the cache, and how
// old that is (reported by OfflineNotice): the age as a line of its own, the
// screen's explanation behind "Read more". That replaces the generic "some
// information may be out of date" — which hinted at staleness without saying
// how stale — and it is why a screen on cached data raises the banner even
// with signal: the server being unreachable leaves the paddler on the same
// stale data, and the age matters just as much.
//
// A screen with no cached copy (NeedsConnectionNotice) has no age to state; its
// message — what needs a connection — is then the whole point and is shown
// directly rather than behind the toggle.
function syncedLabel(cachedAt: string | null): string {
  return cachedAt === null ? "Last sync time unknown." : `Last synced ${formatTimeAgo(cachedAt)}.`
}

// The worst case, for the one age line shown collapsed: a screen with two
// cached surfaces is only as fresh as its older one. An unknown age counts as
// the oldest of all — "unknown" must never be hidden behind a known one.
function oldestCachedAt(dated: (string | null)[]): string | null {
  if (dated.some((cachedAt) => cachedAt === null)) return null
  return (dated as string[]).reduce((oldest, cachedAt) =>
    Date.parse(cachedAt) < Date.parse(oldest) ? cachedAt : oldest,
  )
}

function hasMessage(report: CachedSurfaceReport): boolean {
  return report.message !== undefined && report.message !== null && report.message !== ""
}

export function OfflineBanner() {
  const isDeviceOffline = useIsOffline()
  const { reports } = useCachedSurfaces()
  const isOffline = isDeviceOffline || reports.length > 0
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const insets = useSafeAreaInsets()
  const headline = isDeviceOffline ? "No internet connection." : "Can't reach the server."
  const dated = reports.filter((report) => report.cachedAt !== undefined)
  const explained = reports.filter(hasMessage)

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
        accessibilityLabel={`${headline} Tap to expand.`}
        className="absolute right-3 z-50 items-center justify-center rounded-full bg-sunset-500 p-2 shadow-sm"
        style={{ top: insets.top + 8 }}
      >
        <WifiOff size={16} color={lightTokens.destructiveForeground} />
      </Pressable>
    )
  }

  return (
    <View
      className="absolute inset-x-0 z-50 flex-row items-center gap-2 bg-sunset-100 px-4 py-3 shadow-sm"
      style={{ top: insets.top }}
    >
      <WifiOff size={18} color={palette.sunset600} />
      {/* Three tiers, most important first: what happened, how old the screen's
          data is, and — only on request — what cannot be done with it. The
          explanation is what a paddler reads once; the age is what they check
          every time, so it never hides behind the toggle. With no age to state,
          there is nothing to fold the explanation under, so it shows directly. */}
      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-medium text-sunset-600">{headline}</Text>
        {reports.length === 0 && (
          <Text className="text-xs text-sunset-600">Some information may be out of date.</Text>
        )}
        {dated.length > 0 && (
          <Text className="text-xs text-sunset-600">
            {syncedLabel(oldestCachedAt(dated.map((report) => report.cachedAt ?? null)))}
          </Text>
        )}
        {(dated.length === 0 || expanded) &&
          explained.map((report, index) => (
            <Text key={index} className="text-xs text-sunset-600">
              {report.message}
              {/* One age above is enough for one surface; with several,
                  each says its own, since the line above is the oldest. */}
              {dated.length > 1 &&
                report.cachedAt !== undefined &&
                ` ${syncedLabel(report.cachedAt)}`}
            </Text>
          ))}
        {dated.length > 0 && explained.length > 0 && (
          <Pressable
            onPress={() => setExpanded((current) => !current)}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            hitSlop={8}
            className="self-start"
          >
            <Text className="text-xs font-medium text-sunset-600 underline">
              {expanded ? "Show less" : "Read more"}
            </Text>
          </Pressable>
        )}
      </View>
      <Pressable onPress={() => setDismissed(true)} accessibilityRole="button" accessibilityLabel="Dismiss">
        <X size={16} color={palette.sunset600} />
      </Pressable>
    </View>
  )
}
