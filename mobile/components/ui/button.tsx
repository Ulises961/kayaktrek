import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"
import { Pressable, type PressableProps } from "react-native"

import { cn } from "../../lib/cn"
import { Text } from "./text"

const buttonVariants = cva("flex-row items-center justify-center rounded-md", {
  variants: {
    variant: {
      default: "bg-primary active:opacity-90",
      secondary: "bg-secondary active:opacity-90",
      // The call to action — bringing something into existence (a trip, a log, a
      // checklist item), never a save-existing-thing or a dialog confirm. Mirrors
      // web's `ctaButtonClass` (frontend/components/common/button-roles.ts); one role,
      // one colour, no exceptions.
      cta: "bg-cta active:opacity-90",
      destructive: "bg-destructive active:opacity-90",
      outline: "border border-border bg-transparent active:bg-muted",
      ghost: "bg-transparent active:bg-muted",
    },
    size: {
      default: "h-11 px-4",
      sm: "h-9 px-3",
      lg: "h-12 px-6",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
})

const buttonTextVariants = cva("text-center font-medium", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      secondary: "text-secondary-foreground",
      cta: "text-cta-foreground",
      destructive: "text-destructive-foreground",
      outline: "text-foreground",
      ghost: "text-foreground",
    },
    size: {
      default: "text-base",
      sm: "text-sm",
      lg: "text-lg",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
})

export interface ButtonProps
  extends Omit<PressableProps, "children">,
    VariantProps<typeof buttonVariants> {
  // Narrower than Pressable's own `children`, which also allows a
  // `(state) => ReactNode` render-prop form this wrapper doesn't support (it always
  // reads `children` directly as a value, never invokes it).
  children?: React.ReactNode
  className?: string
  textClassName?: string
}

const Button = React.forwardRef<React.ComponentRef<typeof Pressable>, ButtonProps>(
  ({ className, textClassName, variant, size, disabled, children, ...props }, ref) => (
    <Pressable
      ref={ref}
      disabled={disabled}
      // NativeWind has no `disabled:` variant to key off Pressable's own prop (that's
      // a CSS pseudo-class, not something RN exposes to the style engine), so a
      // disabled button rendered identically to an enabled one — this app had no
      // disabled-button treatment anywhere until now.
      className={cn(buttonVariants({ variant, size }), disabled && "opacity-50", className)}
      {...props}
    >
      {React.isValidElement(children) ? (
        children
      ) : (
        // Not just a plain string: a multi-child JSX body (e.g. "Day {n}") compiles to
        // an array, which a bare `typeof children === "string"` check misses — see the
        // same fix's comment in chip.tsx for the RN crash that causes.
        <Text className={cn(buttonTextVariants({ variant, size }), textClassName)}>
          {children}
        </Text>
      )}
    </Pressable>
  ),
)
Button.displayName = "Button"

export { Button, buttonTextVariants, buttonVariants }
