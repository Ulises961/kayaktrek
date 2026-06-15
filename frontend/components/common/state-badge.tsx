import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import type { TripState } from "@/lib/dtos/trip"

const stateBadgeVariants = cva(
  "inline-flex items-center rounded-[3px] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] border border-current opacity-90",
  {
    variants: {
      state: {
        building: "bg-[var(--state-planning-bg)]  text-[var(--state-planning-fg)]",
        happening: "bg-[var(--state-happening-bg)] text-[var(--state-happening-fg)]",
        past: "bg-[var(--state-past-bg)]      text-[var(--state-past-fg)]",
      },
    },
    defaultVariants: {
      state: "building",
    },
  },
)

const labels: Record<TripState, string> = {
  building: "Building",
  happening: "Happening",
  past: "Past",
}

interface StateBadgeProps extends VariantProps<typeof stateBadgeVariants> {
  state: TripState
  className?: string
}

export function StateBadge({ state, className }: StateBadgeProps) {
  return (
    <span data-slot="state-badge" className={cn(stateBadgeVariants({ state }), className)}>
      {labels[state]}
    </span>
  )
}
