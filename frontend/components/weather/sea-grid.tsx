"use client"
import { useState, useCallback } from "react"
import { Navigation2, Waves } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatHour } from "@/lib/weather/hourly"
import { useCarouselHour } from "@/lib/weather/use-carousel-hour"
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel"
import { waveHeightSeverity } from "@/lib/weather/beaufort"
import type { SeaState } from "@/lib/dtos/sea"
import type { UseEmblaCarouselType } from "embla-carousel-react"

type CarouselApi = UseEmblaCarouselType[1]

interface SeaGridProps {
  states: SeaState[]
  selectedHour?: number | null
  onHourChange?: (hour: number) => void
}

const waveSeverityStyles: Record<ReturnType<typeof waveHeightSeverity>, string> = {
  calm: "text-green-700  dark:text-green-400",
  moderate: "text-amber-700  dark:text-amber-400",
  rough: "text-orange-700 dark:text-orange-400",
  high: "text-red-700    dark:text-red-400",
}

export function SeaGrid({ states, selectedHour = null, onHourChange }: SeaGridProps) {
  const [api, setApi] = useState<CarouselApi>()
  const handleHourChange = useCallback(
    (hour: number) => {
      onHourChange?.(hour)
    },
    [onHourChange],
  )

  useCarouselHour(api, states, selectedHour, handleHourChange)

  if (states.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-muted-foreground text-xs font-semibold tracking-[0.06em] uppercase">
        Sea &amp; swell
      </h4>
      <Carousel setApi={setApi} opts={{ loop: false }} data-testid="sea-grid">
        <CarouselContent className="ml-0 gap-1">
          {states.map((s) => (
            <CarouselItem key={s.time} className="basis-auto pl-0">
              <div className="border-border/60 bg-muted/30 flex w-14 shrink-0 flex-col items-center gap-1 rounded-md border px-1 py-1.5 text-center transition-colors">
                <span className="text-muted-foreground text-[10px] tabular-nums">
                  {formatHour(s.time)}
                </span>

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
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  )
}
