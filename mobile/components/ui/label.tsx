import * as React from "react"

import { cn } from "../../lib/cn"
import { Text } from "./text"

const Label = React.forwardRef<React.ComponentRef<typeof Text>, React.ComponentProps<typeof Text>>(
  ({ className, ...props }, ref) => (
    <Text
      ref={ref}
      className={cn("text-sm font-medium text-foreground", className)}
      {...props}
    />
  ),
)
Label.displayName = "Label"

export { Label }
