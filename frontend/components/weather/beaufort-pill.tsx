import { cn } from "@/lib/utils"
import { knotsToBeaufort, beaufortSeverity, degreesToCompass } from "@/lib/weather/beaufort"

const severityStyles: Record<ReturnType<typeof beaufortSeverity>, string> = {
  calm:     "bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-400",
  moderate: "bg-amber-100  text-amber-700  dark:bg-amber-900/30  dark:text-amber-400",
  strong:   "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  gale:     "bg-red-100    text-red-700    dark:bg-red-900/30    dark:text-red-400",
}

interface BeaufortPillProps {
  knots: number
  direction?: number | null
  className?: string
}

export function BeaufortPill({ knots, direction, className }: BeaufortPillProps) {
  const severity = beaufortSeverity(knotsToBeaufort(knots))
  const label =
    direction != null
      ? `${degreesToCompass(direction)} ${Math.round(knots)} kn`
      : `${Math.round(knots)} kn`

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[3px] px-1.5 py-0.5 text-[10px] font-medium",
        severityStyles[severity],
        className,
      )}
    >
      {label}
    </span>
  )
}
