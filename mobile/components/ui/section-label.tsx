import type { ReactNode } from "react"

import { cn } from "../../lib/cn"
import { Text } from "./text"

// Mobile port of frontend/components/common/section-label.tsx's uppercase group
// heading, but NOT its muted-foreground color: on mobile that token is an ocean
// blue (chart-ink, not a neutral gray — fine for muted body text, wrong for a
// section heading, which read like a link instead of a title). `foreground` itself
// is a near-black navy already claimed by body text, so a heading needs its own
// step in the hierarchy: `slate-500`, the palette's true neutral gray (not
// ocean-tinted), one size up from the old muted-foreground reading. Spacing
// belongs to the call site, not here.
export function SectionLabel({
  children,
  className,
  testID,
}: {
  children: ReactNode
  className?: string
  testID?: string
}) {
  return (
    <Text
      testID={testID}
      className={cn(
        "text-sm font-semibold uppercase tracking-wide text-slate-500",
        className,
      )}
    >
      {children}
    </Text>
  )
}
