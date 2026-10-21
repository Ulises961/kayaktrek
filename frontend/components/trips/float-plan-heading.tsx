import type { ReactNode } from "react"

interface FloatPlanHeadingProps {
  icon: ReactNode
  children: ReactNode
  /** What belongs to this section alone, at the end of its heading row: a status, an Edit. */
  action?: ReactNode
}

// The heading of one section of the Float plan tab. A plain title with an icon, so the
// tab reads as a few named sections rather than a column of small-caps labels.
export function FloatPlanHeading({ icon, children, action }: FloatPlanHeadingProps) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="text-muted-foreground">{icon}</span>
        {children}
      </h2>
      {action}
    </div>
  )
}
