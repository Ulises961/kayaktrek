import { cn } from "@/lib/utils"

// Small uppercase group heading for list sections (crew groups, gear-closet
// categories, items-tab buckets). Promoted from crew-tab's local copy (M12 §L
// discipline) — spacing belongs to the call site, not the label.
export function SectionLabel({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <p
      className={cn(
        "text-muted-foreground text-xs font-semibold tracking-wide uppercase",
        className,
      )}
    >
      {children}
    </p>
  )
}
