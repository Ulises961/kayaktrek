import * as React from "react"
import { View, type ViewProps } from "react-native"

import { lightTokens } from "@shared/tokens"

import { cn } from "../../lib/cn"
import { Text } from "./text"

function Card({ className, style, children, ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={cn("overflow-hidden rounded-lg p-4", className)}
      // The same surface web's Card has: `--card` (white) on the app's warm `--background`,
      // with the `--border` hairline. It carried chart paper (#f7f4ec) and a blue
      // cartouche border instead — the chart-cartouche treatment, which on web is scoped
      // to chart furniture rather than applied to every card. Two consequences on a
      // phone, where almost every surface is a card: the card sat ~2 points from `--muted`
      // (#f5f3ef), so a card and the controls resting on it read as one flat field, and
      // the blue border pushed further into an app already heavy with blue.
      style={[
        {
          backgroundColor: lightTokens.card,
          borderWidth: 1,
          borderColor: lightTokens.border,
          // Web's `shadow-sm`. This is what separates a white card from the warm
          // background now that the border is a quiet neutral rather than a blue rule.
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
