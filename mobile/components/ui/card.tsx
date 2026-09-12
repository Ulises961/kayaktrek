import * as React from "react"
import { View, type ViewProps } from "react-native"

import { cn } from "../../lib/cn"
import { Text } from "./text"

function Card({ className, style, ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={cn("rounded-lg border border-border bg-card p-4", className)}
      // Same cross-platform shadow shape as zoom-control.tsx's map overlay — a flat
      // 1px border alone read as a wireframe outline, not a raised surface (M30
      // identity pass). Kept subtle: this lifts every list/hub card in the app.
      style={[{ elevation: 2, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4 }, style]}
      {...props}
    />
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
