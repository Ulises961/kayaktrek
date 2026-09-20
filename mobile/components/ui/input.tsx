import * as React from "react"
import { TextInput, type TextInputProps } from "react-native"

import { lightTokens } from "@shared/tokens"

import { cn } from "../../lib/cn"

// Exported so its styling is inspectable the way buttonVariants/chipVariants are —
// react-native-css strips className from the rendered element, so a test has no other
// way to assert what surface the field takes.
export const inputClassName =
  // Transparent, so the field takes the colour of the surface it sits in — the same
  // split web makes. A button is a raised control and carries its own `bg-background`;
  // a field is a recess in its container, and giving it a sand fill of its own turned
  // every form into a stack of sand bars on a white card.
  "rounded-md border border-input bg-transparent px-4 text-base text-foreground"

const Input = React.forwardRef<TextInput, TextInputProps & { className?: string }>(
  ({ className, multiline, ...props }, ref) => (
    <TextInput
      ref={ref}
      className={cn(
        inputClassName,
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
      // A slate the palette has no name for; --muted-foreground is the role for
      // secondary text, and it is what web's input placeholder resolves to.
      placeholderTextColor={lightTokens.mutedForeground}
      {...props}
    />
  ),
)
Input.displayName = "Input"

export { Input }
