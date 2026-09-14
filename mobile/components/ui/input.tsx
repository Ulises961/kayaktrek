import * as React from "react"
import { TextInput, type TextInputProps } from "react-native"

import { cn } from "../../lib/cn"

const Input = React.forwardRef<TextInput, TextInputProps & { className?: string }>(
  ({ className, multiline, ...props }, ref) => (
    <TextInput
      ref={ref}
      className={cn(
        "rounded-md border border-input bg-background px-4 text-base text-foreground",
        // A fixed height + Android's default top-anchored text only agree once
        // textAlignVertical is set explicitly — otherwise growing the box (h-14 vs.
        // the old h-11) just adds dead space below the text instead of centering it.
        // Skipped for multiline (notes, etc.), which wants top alignment and its own
        // height passed via className.
        multiline ? "py-3" : "h-14",
        className,
      )}
      textAlignVertical={multiline ? "top" : "center"}
      multiline={multiline}
      placeholderTextColor="#94a3b8"
      {...props}
    />
  ),
)
Input.displayName = "Input"

export { Input }
