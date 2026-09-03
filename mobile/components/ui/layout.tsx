import * as React from "react"
import { View, type ViewProps } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { cn } from "../../lib/cn"

/**
 * The small set of layout atoms — full screen container, vertical/horizontal stacks.
 * `Screen` now uses `react-native-safe-area-context`'s `SafeAreaView`, not RN's own
 * (deprecated) one — installed as part of M9b WP1's real navigation shell, which is
 * exactly the "real screens" moment this component's original comment deferred to.
 * Requires `<SafeAreaProvider>` somewhere above it in the tree (app/_layout.tsx).
 */
function Screen({ className, ...props }: ViewProps & { className?: string }) {
  return <SafeAreaView className={cn("flex-1 bg-background", className)} {...props} />
}

function Stack({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn("flex-col gap-3", className)} {...props} />
}

function Row({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn("flex-row items-center gap-3", className)} {...props} />
}

export { Row, Screen, Stack }
