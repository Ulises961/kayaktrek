import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"
import { Pressable, type PressableProps } from "react-native"

import { cn } from "../../lib/cn"
import { Text } from "./text"

// Extracted from trips/[id]/index.tsx's inline day-chip ternary (M9b2 WP6) — same
// active/inactive pill both the day strip and the float-plan link already used,
// just no longer duplicated as a string ternary that would drift if one call site
// changed and the other didn't.
const chipVariants = cva("rounded-full px-4 py-2", {
  variants: {
    active: {
      true: "bg-primary",
      false: "border border-border bg-transparent",
    },
  },
  defaultVariants: {
    active: false,
  },
})

const chipTextVariants = cva("text-sm", {
  variants: {
    active: {
      true: "text-primary-foreground",
      false: "text-foreground",
    },
  },
  defaultVariants: {
    active: false,
  },
})

export interface ChipProps extends Omit<PressableProps, "children">, VariantProps<typeof chipVariants> {
  // Narrower than Pressable's own `children` — see button.tsx's identical override
  // for why the render-prop form is excluded.
  children?: React.ReactNode
  className?: string
  textClassName?: string
}

export const Chip = React.forwardRef<React.ComponentRef<typeof Pressable>, ChipProps>(
  ({ active, className, textClassName, children, ...props }, ref) => (
    <Pressable ref={ref} className={cn(chipVariants({ active }), className)} {...props}>
      {React.isValidElement(children) ? (
        children
      ) : (
        // Not just a plain string: `Day {day.dayNumber}` compiles to an array of a
        // string and a number, which `typeof children === "string"` (Button/Badge's
        // own check) misses — RN then throws "Text strings must be rendered within
        // a <Text> component" trying to render that array as a raw Pressable child.
        <Text className={cn(chipTextVariants({ active }), textClassName)}>{children}</Text>
      )}
    </Pressable>
  ),
)
Chip.displayName = "Chip"
