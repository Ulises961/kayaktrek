"use client"
import { useEffect, useState } from "react"
import { Navigation2, Waves, ArrowUp, ArrowDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDistance, formatTime, estimatedTime } from "@/lib/itinerary/distance"
import { fetchDayWeather, fetchDaySea } from "@/lib/weather/actions"
import { waveHeightSeverity } from "@/lib/weather/beaufort"
import { representativeHour } from "@/lib/weather/hourly"
import { BeaufortPill } from "@/components/weather/beaufort-pill"
import type { Weather, WeatherState } from "@/lib/dtos/weather"
import type { Sea, SeaState } from "@/lib/dtos/sea"

export type DayStripCardProps = {
  dayId: string
  dayNumber: number
  date: string | null
  distanceNm: number
  avgSpeedKnots: number
  distanceUnit: "nm" | "km"
  isSelected: boolean
  isToday: boolean
  isPastDay: boolean
  onClick: () => void
}

const waveSeverityStyles: Record<ReturnType<typeof waveHeightSeverity>, string> = {
  calm: "text-green-700  dark:text-green-400",
  moderate: "text-amber-700  dark:text-amber-400",
  rough: "text-orange-700 dark:text-orange-400",
  high: "text-red-700    dark:text-red-400",
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
}

export function DayStripCard({
  dayId,
  dayNumber,
  date,
  distanceNm,
  avgSpeedKnots,
  distanceUnit,
  isSelected,
  isToday,
  isPastDay,
  onClick,
}: DayStripCardProps) {
  const dist = formatDistance(distanceNm, distanceUnit)
  const time = formatTime(estimatedTime(distanceNm, avgSpeedKnots))

  const [weather, setWeather] = useState<Weather | null>(null)
  const [sea, setSea] = useState<Sea | null>(null)

  useEffect(() => {
    let active = true
    fetchDayWeather(dayId).then((r) => {
      if (active && r.success) setWeather(r.data)
    })
    fetchDaySea(dayId).then((r) => {
      if (active && r.success) setSea(r.data)
    })
    return () => {
      active = false
    }
  }, [dayId])

  const windState: WeatherState | undefined = representativeHour(weather?.weatherStates)
  const waveState: SeaState | undefined = representativeHour(sea?.seaStates)

  const hasWind = windState != null && windState.windForce != null
  const hasWave = waveState != null && waveState.waveHeight != null
  const tideTime = sea?.highTide ?? sea?.lowTide ?? null
  const tideIsHigh = sea?.highTide != null
  const hasTide = tideTime != null

  const showChips = hasWind || hasWave || hasTide

  return (
    <button
      type="button"
      role="button"
      onClick={onClick}
      data-selected={isSelected ? "true" : undefined}
      data-today={isToday ? "true" : undefined}
      data-past={isPastDay ? "true" : undefined}
      className={cn(
        "flex h-full w-36 shrink-0 items-stretch overflow-hidden rounded-lg border text-left text-xs transition-all",
        "border-border bg-background/80 hover:bg-muted/60",
        isSelected && "border-primary bg-muted ring-primary ring-1",
        isToday && "border-primary bg-primary/10 font-medium",
        isPastDay && "opacity-50",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1 px-2 py-2">
        <span className="text-foreground font-semibold">Day {dayNumber}</span>
        <span className="text-muted-foreground">{date ? formatDate(date) : "No date"}</span>
        <span className="text-muted-foreground">
          {dist} {distanceUnit} · {time}
        </span>

        {showChips && (
          <div
            data-testid="weather-chips"
            className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5"
          >
            <span className="inline-flex items-center gap-0.5">
              <Navigation2
                className="text-muted-foreground size-3 shrink-0"
                aria-hidden
                style={
                  hasWind ? { transform: `rotate(${windState!.windDirection ?? 0}deg)` } : undefined
                }
              />
              {hasWind ? (
                <BeaufortPill knots={windState!.windForce!} direction={windState!.windDirection} />
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </span>

            <span className="inline-flex items-center gap-0.5">
              <Waves className="text-muted-foreground size-3 shrink-0" aria-hidden />
              {hasWave ? (
                <span
                  className={cn(
                    "text-[10px] font-medium",
                    waveSeverityStyles[waveHeightSeverity(waveState!.waveHeight)],
                  )}
                >
                  {waveState!.waveHeight.toFixed(1)} m
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </span>

            <span className="inline-flex items-center gap-0.5">
              {tideIsHigh ? (
                <ArrowUp className="text-muted-foreground size-3 shrink-0" aria-hidden />
              ) : (
                <ArrowDown className="text-muted-foreground size-3 shrink-0" aria-hidden />
              )}
              {hasTide ? (
                <span className="text-muted-foreground text-[10px] font-medium">
                  {tideIsHigh ? "HW" : "LW"} {tideTime}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </span>
          </div>
        )}
      </div>
    </button>
  )
}
