import type { ReactNode } from "react"

import { cn } from "../../lib/cn"
import { Text } from "./text"

// Mobile port of frontend/components/common/section-label.tsx's uppercase group
// heading, but NOT its muted-foreground color: on mobile that token is an ocean
// blue (chart-ink, not a neutral gray — fine for muted body text, wrong for a
// section heading, which read like a link instead of a title). Dark ink + a step
// up in size instead. Spacing belongs to the call site, not here.
export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <Text
      className={cn(
        "text-sm font-semibold uppercase tracking-wide text-foreground",
        className,
      )}
    >
      {children}
    </Text>
  )
}
