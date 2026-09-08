import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"
import { View, type ViewProps } from "react-native"

import { cn } from "../../lib/cn"
import { Text } from "./text"

const badgeVariants = cva("flex-row items-center self-start rounded-full px-2.5 py-0.5", {
  variants: {
    variant: {
      default: "bg-primary",
      secondary: "bg-secondary",
      destructive: "bg-destructive",
      outline: "border border-border bg-transparent",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

const badgeTextVariants = cva("text-xs font-medium", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      secondary: "text-secondary-foreground",
      destructive: "text-destructive-foreground",
      outline: "text-foreground",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

export interface BadgeProps extends ViewProps, VariantProps<typeof badgeVariants> {
  className?: string
  textClassName?: string
}

function Badge({ className, textClassName, variant, children, ...props }: BadgeProps) {
  return (
    <View className={cn(badgeVariants({ variant }), className)} {...props}>
      {React.isValidElement(children) ? (
        children
      ) : (
        // Not just a plain string: see the same fix's comment in chip.tsx for why a
        // bare `typeof children === "string"` check misses a multi-child JSX body.
        <Text className={cn(badgeTextVariants({ variant }), textClassName)}>{children}</Text>
      )}
    </View>
  )
}

export { Badge, badgeTextVariants, badgeVariants }
