import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import type { TripState } from "@/lib/dtos/trip"

const stateBadgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      state: {
        draft:     "bg-[var(--state-draft-bg)]     text-[var(--state-draft-fg)]",
        planning:  "bg-[var(--state-planning-bg)]  text-[var(--state-planning-fg)]",
        happening: "bg-[var(--state-happening-bg)] text-[var(--state-happening-fg)]",
        past:      "bg-[var(--state-past-bg)]      text-[var(--state-past-fg)]",
      },
    },
    defaultVariants: {
      state: "draft",
    },
  }
)

const labels: Record<TripState, string> = {
  draft:     "Draft",
  planning:  "Planning",
  happening: "Happening",
  past:      "Past",
}

interface StateBadgeProps extends VariantProps<typeof stateBadgeVariants> {
  state: TripState
  className?: string
}

export function StateBadge({ state, className }: StateBadgeProps) {
  return (
    <span className={cn(stateBadgeVariants({ state }), className)}>
      {labels[state]}
    </span>
  )
}
