import * as React from "react"
import { TextInput, type TextInputProps } from "react-native"

import { cn } from "../../lib/cn"

const Input = React.forwardRef<TextInput, TextInputProps & { className?: string }>(
  ({ className, ...props }, ref) => (
    <TextInput
      ref={ref}
      className={cn(
        "h-11 rounded-md border border-input bg-background px-3 text-base text-foreground",
        className,
      )}
      placeholderTextColor="#94a3b8"
      {...props}
    />
  ),
)
Input.displayName = "Input"

export { Input }
