import { Navigation2, CloudRain, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatHour } from "@/lib/weather/hourly"
import { BeaufortPill } from "@/components/weather/beaufort-pill"
import type { WeatherState } from "@/lib/dtos/weather"

interface WeatherGridProps {
  states: WeatherState[]
  onRefresh: () => void
  isRefreshing: boolean
  canRefresh?: boolean
}

export function WeatherGrid({ states, onRefresh, isRefreshing, canRefresh = true }: WeatherGridProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Weather</h4>
        {canRefresh && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`size-3 ${isRefreshing ? "animate-spin" : ""}`} aria-hidden />
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </Button>
        )}
      </div>

      {states.length === 0 ? (
        <p className="text-xs text-muted-foreground">No weather data yet — hit Refresh to fetch the forecast.</p>
      ) : (
        <div className="flex gap-1 overflow-x-auto pb-1" data-testid="weather-grid">
          {states.map((s) => (
            <div
              key={s.time}
              className="flex w-14 shrink-0 flex-col items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-1 py-1.5 text-center"
            >
              <span className="text-[10px] text-muted-foreground tabular-nums">{formatHour(s.time)}</span>
              {s.windForce != null ? (
                <span className="flex flex-col items-center gap-0.5">
                  <Navigation2
                    className="size-3 text-muted-foreground"
                    aria-hidden
                    style={{ transform: `rotate(${s.windDirection ?? 0}deg)` }}
                  />
                  <BeaufortPill knots={s.windForce} />
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground">—</span>
              )}
              <span className="h-3.5">
                {s.precipitation != null && s.precipitation > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] text-sky-600 dark:text-sky-400">
                    <CloudRain className="size-3" aria-hidden />
                    {s.precipitation.toFixed(1)}
                  </span>
                )}
              </span>
              <span className="text-[11px] font-medium tabular-nums">
                {s.temperature != null ? `${Math.round(s.temperature)}°` : "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
