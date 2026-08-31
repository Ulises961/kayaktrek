import * as React from "react"
import { SafeAreaView, View, type ViewProps } from "react-native"

import { cn } from "../../lib/cn"

/**
 * The small set of layout atoms — full screen container, vertical/horizontal stacks.
 * Deliberately RN's own `SafeAreaView`/`View`, not `react-native-safe-area-context`:
 * no new native dependency belongs in a scaffold-only work package, and M9b's real
 * navigation shell is exactly where that call gets made for real screens.
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
