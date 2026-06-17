"use client"
import { Navigation2, Waves } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatHour, hourOf } from "@/lib/weather/hourly"
import { useCenteredHourScroll } from "@/lib/weather/use-centered-hour-scroll"
import { waveHeightSeverity } from "@/lib/weather/beaufort"
import type { SeaState } from "@/lib/dtos/sea"

interface SeaGridProps {
  states: SeaState[]
  // The hour (0–23) selected on the map slider — the matching card is highlighted
  // and centred so the carousel tracks the slider alongside the weather grid.
  selectedHour?: number
}

const waveSeverityStyles: Record<ReturnType<typeof waveHeightSeverity>, string> = {
  calm: "text-green-700  dark:text-green-400",
  moderate: "text-amber-700  dark:text-amber-400",
  rough: "text-orange-700 dark:text-orange-400",
  high: "text-red-700    dark:text-red-400",
}

export function SeaGrid({ states, selectedHour }: SeaGridProps) {
  const { containerRef, activeRef } = useCenteredHourScroll(selectedHour)

  if (states.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-muted-foreground text-xs font-semibold tracking-[0.06em] uppercase">
        Sea &amp; swell
      </h4>
      <div
        ref={containerRef}
        className={cn(
          "flex gap-1 pb-1",
          selectedHour != null ? "overflow-x-hidden" : "overflow-x-auto",
        )}
        data-testid="sea-grid"
      >
        {states.map((s) => {
          const isActive = selectedHour != null && hourOf(s.time) === selectedHour
          return (
            <div
              key={s.time}
              ref={isActive ? activeRef : undefined}
              data-active={isActive || undefined}
              className={cn(
                "flex w-14 shrink-0 flex-col items-center gap-1 rounded-md border px-1 py-1.5 text-center transition-colors",
                isActive
                  ? "border-primary bg-primary/10 ring-primary/40 ring-1"
                  : "border-border/60 bg-muted/30",
              )}
            >
              <span className="text-muted-foreground text-[10px] tabular-nums">
                {formatHour(s.time)}
              </span>

              {/* wind wave: label + height + direction arrow */}
              <span className="flex flex-col items-center gap-0.5">
                <span className="flex items-center gap-0.5">
                  <Waves className="text-muted-foreground size-2.5" aria-hidden />
                  <span className="text-muted-foreground/60 text-[8px] font-semibold tracking-wide uppercase">
                    wv
                  </span>
                </span>
                <span
                  className={cn(
                    "text-[11px] font-medium tabular-nums",
                    waveSeverityStyles[waveHeightSeverity(s.waveHeight)],
                  )}
                >
                  {s.waveHeight.toFixed(1)} m
                </span>
                <Navigation2
                  className="text-muted-foreground/70 size-2.5"
                  aria-hidden
                  style={{ transform: `rotate(${s.waveDirection}deg)` }}
                />
              </span>

              {/* swell: label + height + direction arrow + period */}
              <span className="border-border/50 flex w-full flex-col items-center gap-0.5 border-t pt-1">
                <span className="text-[8px] font-semibold tracking-wide text-sky-600/60 uppercase dark:text-sky-400/60">
                  sw
                </span>
                {s.swellWaveHeight != null ? (
                  <span className="text-[10px] font-medium text-sky-600/80 tabular-nums dark:text-sky-400/80">
                    {s.swellWaveHeight.toFixed(1)} m
                  </span>
                ) : (
                  <span className="text-muted-foreground/50 text-[10px]">—</span>
                )}
                {s.swellDirection != null && (
                  <Navigation2
                    className="size-2.5 text-sky-600/80 dark:text-sky-400/80"
                    aria-hidden
                    style={{ transform: `rotate(${s.swellDirection}deg)` }}
                  />
                )}
                {s.swellPeriod != null ? (
                  <span className="text-muted-foreground text-[10px] tabular-nums">
                    {s.swellPeriod.toFixed(0)} s
                  </span>
                ) : (
                  <span className="text-muted-foreground/50 text-[10px]">—</span>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
