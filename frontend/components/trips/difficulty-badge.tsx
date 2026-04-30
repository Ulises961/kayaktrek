import { cn } from "@/lib/utils"
import type { TripDifficulty } from "@/lib/dtos/trip"

const styles: Record<TripDifficulty, string> = {
  easy:      "bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-400",
  moderate:  "bg-amber-100  text-amber-700  dark:bg-amber-900/30  dark:text-amber-400",
  demanding: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  expert:    "bg-red-100    text-red-700    dark:bg-red-900/30    dark:text-red-400",
}

const labels: Record<TripDifficulty, string> = {
  easy:      "Easy",
  moderate:  "Moderate",
  demanding: "Demanding",
  expert:    "Expert",
}

interface DifficultyBadgeProps {
  difficulty: TripDifficulty | null | undefined
  className?: string
}

export function DifficultyBadge({ difficulty, className }: DifficultyBadgeProps) {
  if (!difficulty) return null

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[3px] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] border border-current opacity-90",
        styles[difficulty],
        className
      )}
    >
      {labels[difficulty]}
    </span>
  )
}
