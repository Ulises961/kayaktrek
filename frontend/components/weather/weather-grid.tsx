import { Navigation2, CloudRain, Sun, CloudSun, Cloud } from "lucide-react"
import { formatHour } from "@/lib/weather/hourly"
import { BeaufortPill } from "@/components/weather/beaufort-pill"
import type { WeatherState } from "@/lib/dtos/weather"

function CloudIcon({ cloud }: { cloud: string | null | undefined }) {
  const pct = cloud != null ? parseInt(cloud, 10) : null
  if (pct == null || isNaN(pct)) return null
  if (pct < 25) return <Sun className="size-3 text-amber-400" aria-label={`${pct}% cloud`} />
  if (pct < 62) return <CloudSun className="size-3 text-muted-foreground" aria-label={`${pct}% cloud`} />
  return <Cloud className="size-3 text-slate-400" aria-label={`${pct}% cloud`} />
}

interface WeatherGridProps {
  states: WeatherState[]
}

export function WeatherGrid({ states }: WeatherGridProps) {
  if (states.length === 0) {
    return <p className="text-xs text-muted-foreground">No weather data.</p>
  }

  return (
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
          <span className="h-3.5 flex items-center justify-center">
            <CloudIcon cloud={s.cloud} />
          </span>
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
  )
}
