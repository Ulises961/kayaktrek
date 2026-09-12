import * as React from "react"
import { View, type ViewProps } from "react-native"

import { cn } from "../../lib/cn"
import { Text } from "./text"

function Card({ className, style, children, ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={cn("overflow-hidden rounded-lg p-4", className)}
      // The web cartouche itself, not an invented accent: chart-paper background
      // (oklch(0.966 0.009 92) -> #f7f4ec) + a chart-hairline border at the same
      // ~26% strength globals.css's `.chart-cartouche` uses (chart-hairline is
      // oklch(0.43 0.165 243) -> #0053a1; rgba lets RN apply that opacity directly
      // rather than pre-blending against a specific background). An earlier pass
      // put a flat, full-strength blue bar across the top of every card instead —
      // reads as decoration invented for mobile, and made the blue-overload
      // problem worse rather than better. This is quieter and is what "cartouche"
      // actually names on web.
      style={[
        {
          backgroundColor: "#f7f4ec",
          borderWidth: 1,
          borderColor: "rgba(0, 83, 161, 0.26)",
          elevation: 2,
          shadowColor: "#000",
          shadowOpacity: 0.08,
          shadowRadius: 4,
        },
        style,
      ]}
      {...props}
    >
      {children}
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
