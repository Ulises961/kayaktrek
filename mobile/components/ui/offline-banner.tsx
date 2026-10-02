import { useEffect, useRef, useState } from "react"
import { ActivityIndicator, Pressable, View } from "react-native"
import { RefreshCw, WifiOff, X } from "lucide-react-native"

import { lightTokens, palette } from "@shared/tokens"
import { formatTimeAgo } from "@shared/utils/date"

import { type CachedSurfaceReport, useCachedSurfaces } from "../../lib/network/cached-surfaces"
import { recheckConnectivity, useIsOffline } from "../../lib/network/use-is-offline"
import { Text } from "./text"

// Rendered by every Screen (components/ui/layout.tsx), in flow above the screen's
// content and below the native header — it used to float from the app root over
// the header and ended up covering the drawer's menu button. It reflects live
// device connectivity (useIsOffline), not one failed request, and stays up for as
// long as the device is actually offline. Dismissing collapses it to an icon pill
// rather than hiding it outright: staying offline is still true and the app
// shouldn't go quiet about it, but the full banner doesn't need to keep competing
// with the screen for the whole time there's no signal. The dismissal is shared
// (CachedSurfacesProvider), so it holds across screens rather than coming back on
// every navigation.
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
  const { reports, dismissed, setDismissed, retryAll } = useCachedSurfaces()
  const isOffline = isDeviceOffline || reports.length > 0
  const [expanded, setExpanded] = useState(false)
  const [rechecking, setRechecking] = useState(false)
  const headline = isDeviceOffline ? "No internet connection." : "Can't reach the server."
  const dated = reports.filter((report) => report.cachedAt !== undefined)
  const explained = reports.filter(hasMessage)

  // A manual escape hatch for when either half of `isOffline` is stale: NetInfo's
  // own passive state (the OS doesn't always fire a change event promptly —
  // captive portals, flaky wifi that never fully drops), or a `reports` entry
  // left over from a backend request that failed for a reason that has since
  // gone away (found live: the device was online and the backend reachable the
  // whole time, but the banner still read "Can't reach the server" because
  // nothing had re-run the request that originally failed). recheckConnectivity()
  // only ever covered the first; retryAll() re-runs every focused screen's own
  // load/reload so a surviving failure re-reports itself and a resolved one clears.
  async function handleRecheck() {
    setRechecking(true)
    try {
      await recheckConnectivity()
      retryAll()
    } finally {
      setRechecking(false)
    }
  }

  // Reconnecting resets dismissal so the next disconnect starts expanded
  // again. This has to be a real effect, not the render-phase "adjust state"
  // pattern the previous version used: that pattern is only sanctioned for a
  // component's OWN state, and `setDismissed` belongs to CachedSurfacesProvider,
  // a different component — calling it during OfflineBanner's render crashed on
  // a real device ("Cannot update a component (CachedSurfacesProvider) while
  // rendering a different component (OfflineBanner)"), which only ever showed
  // as a console warning under the RN Testing Library renderer, never an
  // actual failure there.
  //
  // Guarded to fire only on an observed offline->online *transition*, not on
  // mount: dismissal is shared (CachedSurfacesProvider) and survives this
  // component remounting on navigation (every Screen has its own banner
  // instance), so a fresh instance mounting while momentarily offline=false
  // (useIsOffline starts false until NetInfo's first event lands) must not
  // wipe out a dismissal a previous instance already earned.
  const wasOffline = useRef(isOffline)
  useEffect(() => {
    if (wasOffline.current && !isOffline) setDismissed(false)
    wasOffline.current = isOffline
  }, [isOffline, setDismissed])

  if (!isOffline) return null

  if (dismissed) {
    // A zero-height anchor so the pill floats over the content's top-right
    // corner without taking a row of its own — dismissing is asking for the
    // space back.
    return (
      <View className="z-50 h-0">
        <Pressable
          onPress={() => setDismissed(false)}
          accessibilityRole="button"
          accessibilityLabel={`${headline} Tap to expand.`}
          hitSlop={8}
          className="absolute right-3 top-2 items-center justify-center rounded-full bg-sunset-500 p-2 shadow-sm"
        >
          <WifiOff size={16} color={lightTokens.destructiveForeground} />
        </Pressable>
      </View>
    )
  }

  // In flow, not absolute: Screen renders this above its content and below the
  // native header, so it pushes the content down rather than covering the
  // header's menu button.
  return (
    <View className="flex-row items-center gap-2 bg-sunset-100 px-4 py-3">
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
      {/* Both padded to a 36pt box plus 8pt of slop on every side — a 44pt
          target. The bare 16px icon was the whole touch area, which was hard
          to hit (found on a device), and on the water it is hit with a wet
          thumb. */}
      <Pressable
        onPress={() => void handleRecheck()}
        accessibilityRole="button"
        accessibilityLabel="Recheck connection"
        disabled={rechecking}
        hitSlop={8}
        className="-my-2 items-center justify-center p-2.5"
      >
        {rechecking ? (
          <ActivityIndicator size="small" color={palette.sunset600} />
        ) : (
          <RefreshCw size={16} color={palette.sunset600} />
        )}
      </Pressable>
      <Pressable
        onPress={() => setDismissed(true)}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={8}
        className="-my-2 -mr-2 items-center justify-center p-2.5"
      >
        <X size={16} color={palette.sunset600} />
      </Pressable>
    </View>
  )
}
