import * as React from "react"
import { View, type ViewProps } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { cn } from "../../lib/cn"

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
 */
function Screen({
  className,
  style,
  edges = ["top", "bottom"],
  ...props
}: ViewProps & { className?: string; edges?: ("top" | "bottom")[] }) {
  const insets = useSafeAreaInsets()
  return (
    <View
      className={cn("flex-1 bg-background", className)}
      style={[
        {
          paddingTop: edges.includes("top") ? insets.top : 0,
          paddingBottom: edges.includes("bottom") ? insets.bottom : 0,
        },
        style,
      ]}
      {...props}
    />
  )
}

function Stack({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn("flex-col gap-3", className)} {...props} />
}

function Row({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn("flex-row items-center gap-3", className)} {...props} />
}

export { Row, Screen, Stack }
