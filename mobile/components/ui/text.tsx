import * as React from "react"
import { Text as RNText, type TextProps } from "react-native"

import { cn } from "../../lib/cn"

/**
 * RN's <Text> does not inherit color the way a web element does, so every other atom
 * composes this instead of the raw primitive — matching react-native-reusables' own
 * convention. `className` reaches this component via NativeWind's className-on-Text
 * support (registered in metro.config.js's `globalClassNamePolyfill`).
 */
const Text = React.forwardRef<RNText, TextProps & { className?: string }>(
  ({ className, ...props }, ref) => (
    <RNText ref={ref} className={cn("text-base text-foreground", className)} {...props} />
  ),
)
Text.displayName = "Text"

export { Text }
