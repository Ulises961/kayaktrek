import * as React from "react"
import { View, type ViewProps } from "react-native"

import { cn } from "../../lib/cn"
import { Text } from "./text"

function Card({ className, style, children, ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}
      // Same cross-platform shadow shape as zoom-control.tsx's map overlay — a flat
      // 1px border alone read as a wireframe outline, not a raised surface (M30
      // identity pass). Kept subtle: this lifts every list/hub card in the app.
      style={[{ elevation: 2, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4 }, style]}
      {...props}
    >
      {/* Flat approximation of web's `.chart-top-rule` (globals.css) — the
          "chart-signature" accent bar promoted from the auth cartouche, here
          borrowed to give every card real identity instead of a plain bordered
          box. Web's version is a three-stop ocean->foam gradient; expo-linear-
          gradient isn't a dependency yet (WP1's login-hero gradient needs it
          too), so this is a single-tone stand-in until that's added. */}
      <View className="h-[3px] bg-ocean-600" />
      <View className="p-4">{children}</View>
    </View>
  )
}

function CardHeader({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn("gap-1.5 pb-3", className)} {...props} />
}

function CardTitle({
  className,
  ...props
}: React.ComponentProps<typeof Text>) {
  return (
    <Text className={cn("text-lg font-semibold text-card-foreground", className)} {...props} />
  )
}

function CardDescription({
  className,
  ...props
}: React.ComponentProps<typeof Text>) {
  return <Text className={cn("text-sm text-muted-foreground", className)} {...props} />
}

function CardContent({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn("gap-2", className)} {...props} />
}

function CardFooter({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn("flex-row items-center pt-3", className)} {...props} />
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle }
