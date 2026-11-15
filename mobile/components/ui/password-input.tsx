import * as React from "react"
import { Pressable, View, type TextInput, type TextInputProps } from "react-native"
import { EyeIcon, EyeOffIcon } from "lucide-react-native"

import { palette } from "@shared/tokens"

import { Input } from "./input"

// A password field with the show/hide toggle every phone keyboard user expects — typing a
// 12-character password with a symbol on a small keyboard blind is how a sign-up gets abandoned.
// The toggle is the field's own control, so it sits inside the field's box; the extra right
// padding keeps long entries from running under it.
const PasswordInput = React.forwardRef<
  TextInput,
  Omit<TextInputProps, "secureTextEntry"> & { className?: string }
>(({ className, ...props }, ref) => {
  const [visible, setVisible] = React.useState(false)
  const Icon = visible ? EyeOffIcon : EyeIcon

  return (
    <View className="justify-center">
      <Input
        ref={ref}
        className={className ? `pr-14 ${className}` : "pr-14"}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
      />
      <Pressable
        onPress={() => setVisible((shown) => !shown)}
        accessibilityRole="button"
        accessibilityLabel={visible ? "Hide password" : "Show password"}
        hitSlop={8}
        className="absolute right-0 h-14 w-14 items-center justify-center"
        testID={props.testID ? `${props.testID}-toggle` : undefined}
      >
        <Icon size={20} color={palette.ocean500} />
      </Pressable>
    </View>
  )
})
PasswordInput.displayName = "PasswordInput"

export { PasswordInput }
