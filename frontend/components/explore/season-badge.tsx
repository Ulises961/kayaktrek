import { cn } from "@/lib/utils"

const SEASON_STYLES: Record<string, string> = {
  winter: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  spring: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  summer: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  autumn: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
}

export function SeasonBadge({
  season,
  className,
}: {
  season: string | null | undefined
  className?: string
}) {
  if (!season || !(season in SEASON_STYLES)) return null
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[3px] px-2 py-0.5 text-[10px] font-medium tracking-[0.06em] uppercase",
        SEASON_STYLES[season],
        className,
      )}
    >
      {season}
    </span>
  )
}
