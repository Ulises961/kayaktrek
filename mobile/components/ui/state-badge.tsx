import { cva, type VariantProps } from "class-variance-authority"
import { View, type ViewProps } from "react-native"

import { TRIP_STATE_LABELS, type TripState } from "@shared/dtos/trip"
import { cn } from "../../lib/cn"
import { Text } from "./text"

// Mirrors frontend/components/common/state-badge.tsx's variant → token mapping exactly
// (building -> --state-planning-*, not --state-building-*, per tokens.ts's own naming) —
// consumes the shared theme.generated.css vars, adds no new tokens. `archived` has no
// entry there either; it's a terminal GDPR-only state never shown to a normal viewer.
const stateBadgeVariants = cva(
  "flex-row items-center self-start rounded-[3px] border border-current px-2 py-0.5 opacity-90",
  {
    variants: {
      state: {
        building: "bg-state-planning-bg",
        happening: "bg-state-happening-bg",
        past: "bg-state-past-bg",
      },
    },
    defaultVariants: {
      state: "building",
    },
  },
)

const stateBadgeTextVariants = cva("text-[10px] font-medium uppercase tracking-[0.06em]", {
  variants: {
    state: {
      building: "text-state-planning-fg",
      happening: "text-state-happening-fg",
      past: "text-state-past-fg",
    },
  },
  defaultVariants: {
    state: "building",
  },
})

export interface StateBadgeProps extends ViewProps, VariantProps<typeof stateBadgeVariants> {
  state: TripState
  className?: string
}

export function StateBadge({ state, className, ...props }: StateBadgeProps) {
  return (
    <View className={cn(stateBadgeVariants({ state }), className)} {...props}>
      <Text className={stateBadgeTextVariants({ state })}>{TRIP_STATE_LABELS[state]}</Text>
    </View>
  )
}
