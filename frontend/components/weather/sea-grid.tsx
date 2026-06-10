import { Navigation2, Waves } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatHour } from "@/lib/weather/hourly"
import { waveHeightSeverity } from "@/lib/weather/beaufort"
import type { SeaState } from "@/lib/dtos/sea"

interface SeaGridProps {
  states: SeaState[]
}

const waveSeverityStyles: Record<ReturnType<typeof waveHeightSeverity>, string> = {
  calm:     "text-green-700  dark:text-green-400",
  moderate: "text-amber-700  dark:text-amber-400",
  rough:    "text-orange-700 dark:text-orange-400",
  high:     "text-red-700    dark:text-red-400",
}

export function SeaGrid({ states }: SeaGridProps) {
  if (states.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Sea &amp; swell</h4>
      <div className="flex gap-1 overflow-x-auto pb-1" data-testid="sea-grid">
        {states.map((s) => (
          <div
            key={s.time}
            className="flex w-14 shrink-0 flex-col items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-1 py-1.5 text-center"
          >
            <span className="text-[10px] text-muted-foreground tabular-nums">{formatHour(s.time)}</span>

            {/* wind-wave: height (coloured) + direction */}
            <span className="flex flex-col items-center gap-0.5">
              <Waves className="size-3 text-muted-foreground" aria-hidden />
              <span className={cn("text-[11px] font-medium tabular-nums", waveSeverityStyles[waveHeightSeverity(s.waveHeight)])}>
                {s.waveHeight.toFixed(1)} m
              </span>
              <Navigation2
                className="size-2.5 text-muted-foreground/70"
                aria-hidden
                style={{ transform: `rotate(${s.waveDirection}deg)` }}
              />
            </span>

            {/* swell: direction + period (distinct phenomenon, shown separately) */}
            <span className="flex flex-col items-center gap-0.5 border-t border-border/50 pt-1 w-full">
              <Navigation2
                className="size-2.5 text-sky-600/80 dark:text-sky-400/80"
                aria-hidden
                style={{ transform: `rotate(${s.swellDirection}deg)` }}
              />
              <span className="text-[10px] text-muted-foreground tabular-nums">{s.swellPeriod.toFixed(0)} s</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
