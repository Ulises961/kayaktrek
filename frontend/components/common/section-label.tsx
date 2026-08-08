import type { ElementType, ReactNode } from "react"
import { cn } from "@/lib/utils"

// Small uppercase group heading for list sections (crew groups, gear-closet
// categories, items-tab buckets). Spacing belongs to the call site, not here.
//
// `as` follows ListRow's polymorphic pattern: a plain <p> above a list, an <h2>
// where the section is a real document division (the public float plan's
// headings) and the document needs an outline. Same visual treatment either way.
export function SectionLabel({
  as,
  className,
  children,
}: {
  as?: ElementType
  className?: string
  children: ReactNode
}) {
  const Tag = as ?? "p"
  return (
    <Tag
      className={cn(
        "text-muted-foreground text-xs font-semibold tracking-wide uppercase",
        className,
      )}
    >
      {children}
    </Tag>
  )
}
