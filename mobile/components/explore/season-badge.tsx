import { View } from "react-native"

import { cn } from "@mobile/lib/cn"

import { Text } from "../ui/text"

// Port of frontend/components/explore/season-badge.tsx. The four seasons are the only
// values the backend derives, and an unrecognised one renders nothing rather than an
// unstyled pill — same behaviour as web's `!(season in SEASON_STYLES)` guard.
//
// Web's palette is raw Tailwind colour scales (sky/green/amber/orange), which mobile's
// theme does not carry: generate-theme-css.js emits only the shared design tokens. These
// are the same four hues written as literals, which is what web's own file does too —
// they are seasonal signal colours, not design-system roles.
const SEASON_STYLES: Record<string, { background: string; text: string }> = {
  winter: { background: "#e0f2fe", text: "#0369a1" },
  spring: { background: "#dcfce7", text: "#15803d" },
  summer: { background: "#fef3c7", text: "#b45309" },
  autumn: { background: "#ffedd5", text: "#c2410c" },
}

export function SeasonBadge({
  season,
  className,
}: {
  season: string | null | undefined
  className?: string
}) {
  const style = season ? SEASON_STYLES[season] : undefined
  if (!season || !style) return null

  return (
    <View
      className={cn("items-center rounded-[3px] px-2 py-0.5", className)}
      style={{ backgroundColor: style.background }}
    >
      <Text
        className="text-[10px] font-medium uppercase"
        style={{ color: style.text, letterSpacing: 0.6 }}
      >
        {season}
      </Text>
    </View>
  )
}
