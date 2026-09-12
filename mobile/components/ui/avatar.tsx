import { Image, View } from "react-native"

import { cn } from "../../lib/cn"
import { Text } from "./text"

// Minimal port of frontend/components/common/user-avatar.tsx's initials rule (first
// letter of name + first letter of surname, falling back to just the name's).
function initials(name: string, surname?: string | null): string {
  const first = name.trim()[0]?.toUpperCase() ?? ""
  const last = surname?.trim()[0]?.toUpperCase() ?? ""
  return first + last || first
}

export function Avatar({
  name,
  surname,
  imageUrl,
  size = 40,
  className,
}: {
  name: string
  surname?: string | null
  imageUrl?: string | null
  size?: number
  className?: string
}) {
  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        accessibilityLabel={`${name} ${surname ?? ""}`.trim()}
        className={cn("rounded-full", className)}
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <View
      className={cn("items-center justify-center rounded-full bg-primary", className)}
      style={{ width: size, height: size }}
    >
      <Text className="font-semibold text-primary-foreground" style={{ fontSize: size * 0.4 }}>
        {initials(name, surname)}
      </Text>
    </View>
  )
}
