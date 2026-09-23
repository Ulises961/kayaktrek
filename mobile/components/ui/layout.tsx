import * as React from "react"
import { View, type ViewProps } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { cn } from "../../lib/cn"
import { OfflineBanner } from "./offline-banner"

/**
 * The small set of layout atoms — full screen container, vertical/horizontal stacks.
 * `Screen` applies safe-area insets via `useSafeAreaInsets` + inline style, not by
 * putting `className` on `react-native-safe-area-context`'s `SafeAreaView` — react-native-css
 * only auto-intercepts `className` on core RN components, so a `SafeAreaView`'s className is a
 * silent no-op (confirmed: login's `items-center justify-center p-6` never rendered). Plain
 * `View` gets real Tailwind support; insets go through style instead.
 * Requires `<SafeAreaProvider>` somewhere above it in the tree (app/_layout.tsx).
 *
 * `edges` picks which insets to pad for — default is top+bottom, for a screen with no
 * native header (login, under `(auth)`'s headerless Slot). A screen that sits under a
 * `Stack.Screen` header (everything in `(app)`) already has its top inset consumed by
 * that header, so it passes `edges={["bottom"]}` to avoid double-padding the top.
 *
 * The offline banner renders here, in flow above the screen's own content — so below
 * the native header, never over it. It used to float from the app root at the top
 * inset, which put it on top of the header; once it grew to carry the cache age and
 * rose on "can't reach the server" as well, it covered the drawer's menu button
 * (found on a device). `className`/`style` apply to the content below it, so a
 * screen's own centring or padding lays out the content, not the banner.
 */
function Screen({
  className,
  style,
  edges = ["top", "bottom"],
  children,
  ...props
}: ViewProps & { className?: string; edges?: ("top" | "bottom")[] }) {
  const insets = useSafeAreaInsets()
  return (
    <View
      className="flex-1 bg-background"
      style={{
        paddingTop: edges.includes("top") ? insets.top : 0,
        paddingBottom: edges.includes("bottom") ? insets.bottom : 0,
      }}
    >
      <OfflineBanner />
      <View className={cn("flex-1", className)} style={style} {...props}>
        {children}
      </View>
    </View>
  )
}

function Stack({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn("flex-col gap-3", className)} {...props} />
}

function Row({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn("flex-row items-center gap-3", className)} {...props} />
}

export { Row, Screen, Stack }
