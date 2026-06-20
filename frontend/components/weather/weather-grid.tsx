"use client"
import { useState, useCallback } from "react"
import { Navigation2, CloudRain, Sun, CloudSun, Cloud } from "lucide-react"
import { formatHour } from "@/lib/weather/hourly"
import { useCarouselHour } from "@/lib/weather/use-carousel-hour"
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel"
import { BeaufortPill } from "@/components/weather/beaufort-pill"
import type { WeatherState } from "@/lib/dtos/weather"
import type { UseEmblaCarouselType } from "embla-carousel-react"

type CarouselApi = UseEmblaCarouselType[1]

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
  selectedHour?: number | null
  onHourChange?: (hour: number) => void
}

export function WeatherGrid({ states, selectedHour = null, onHourChange }: WeatherGridProps) {
  const [api, setApi] = useState<CarouselApi>()
  const handleHourChange = useCallback(
    (hour: number) => {
      onHourChange?.(hour)
    },
    [onHourChange],
  )

  useCarouselHour(api, states, selectedHour, handleHourChange)

  if (states.length === 0) {
    return <p className="text-muted-foreground text-xs">No weather data.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-muted-foreground text-xs font-semibold tracking-[0.06em] uppercase">
        Wind &amp; weather
      </h4>
      <Carousel setApi={setApi} opts={{ loop: false, align: "center" }} data-testid="weather-grid">
        <CarouselContent className="ml-0 gap-1">
          {states.map((s) => (
            <CarouselItem key={s.time} className="basis-auto pl-0">
              <div className="border-border/60 bg-muted/30 flex w-14 shrink-0 flex-col items-center gap-1 rounded-md border px-1 py-1.5 text-center transition-colors">
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
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  )
}
