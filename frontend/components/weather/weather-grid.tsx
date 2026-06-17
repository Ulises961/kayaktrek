"use client"
import { Navigation2, CloudRain, Sun, CloudSun, Cloud } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatHour, hourOf } from "@/lib/weather/hourly"
import { useCenteredHourScroll } from "@/lib/weather/use-centered-hour-scroll"
import { BeaufortPill } from "@/components/weather/beaufort-pill"
import type { WeatherState } from "@/lib/dtos/weather"

function CloudIcon({ cloud }: { cloud: string | null | undefined }) {
  const pct = cloud != null ? parseInt(cloud, 10) : null
  if (pct == null || isNaN(pct)) return null
  if (pct < 25) return <Sun className="size-5 text-amber-400" aria-label={`${pct}% cloud`} />
  if (pct < 62)
    return <CloudSun className="text-muted-foreground size-5" aria-label={`${pct}% cloud`} />
  return <Cloud className="size-5 text-slate-400" aria-label={`${pct}% cloud`} />
}

interface WeatherGridProps {
  states: WeatherState[]
  // The hour (0–23) currently selected on the map slider. The matching card is
  // highlighted and scrolled to the centre so the carousel tracks the slider.
  selectedHour?: number
}

export function WeatherGrid({ states, selectedHour }: WeatherGridProps) {
  const { containerRef, activeRef } = useCenteredHourScroll(selectedHour)

  if (states.length === 0) {
    return <p className="text-muted-foreground text-xs">No weather data.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-muted-foreground text-xs font-semibold tracking-[0.06em] uppercase">
        Wind &amp; weather
      </h4>
      <div
        ref={containerRef}
        className={cn(
          "flex gap-1 pb-1",
          // Slider-driven (selectedHour set) → lock manual scroll so the slider is the
          // sole scrubber. Standalone (e.g. itinerary tab) → allow manual scrolling.
          selectedHour != null ? "overflow-x-hidden" : "overflow-x-auto",
        )}
        data-testid="weather-grid"
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
              {s.windForce != null ? (
                <span className="flex flex-col items-center gap-0.5">
                  <Navigation2
                    className="text-muted-foreground size-3"
                    aria-hidden
                    style={{ transform: `rotate(${s.windDirection ?? 0}deg)` }}
                  />
                  <BeaufortPill knots={s.windForce} />
                </span>
              ) : (
                <span className="text-muted-foreground text-[10px]">—</span>
              )}
              {/* Coverage icon grouped with temperature so the icon reads as belonging to
              the temp and sits near it, rather than floating below the wind pill. */}
              <div className="mt-1 flex flex-col items-center gap-0.5">
                <CloudIcon cloud={s.cloud} />
                <span className="flex h-3.5 items-center justify-center">
                  {s.precipitation != null && s.precipitation > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] text-sky-600 dark:text-sky-400">
                      <CloudRain className="size-3" aria-hidden />
                      {s.precipitation.toFixed(1)}
                    </span>
                  )}
                </span>
                <span className="text-sm font-medium tabular-nums">
                  {s.temperature != null ? `${Math.round(s.temperature)}°` : "—"}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
