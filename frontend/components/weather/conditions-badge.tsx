import { cn } from "@/lib/utils"
import { beaufortSeverity, beaufortLabel } from "@/lib/weather/beaufort"

const severityStyles: Record<ReturnType<typeof beaufortSeverity>, string> = {
  calm: "bg-green-100  text-green-800  dark:bg-green-900/30  dark:text-green-400",
  moderate: "bg-amber-100  text-amber-800  dark:bg-amber-900/30  dark:text-amber-400",
  strong: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  gale: "bg-red-100    text-red-800    dark:bg-red-900/30    dark:text-red-400",
}

interface ConditionsBadgeProps {
  bft: number
  className?: string
}

export function ConditionsBadge({ bft, className }: ConditionsBadgeProps) {
  const severity = beaufortSeverity(bft)
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-0.5 rounded-[3px] px-1.5 py-0.5 font-semibold",
        severityStyles[severity],
        className,
      )}
      title={beaufortLabel(bft)}
    >
      <span className="text-[9px] font-medium opacity-70">Bft</span>
      <span className="text-[11px]">{bft}</span>
    </span>
  )
}
