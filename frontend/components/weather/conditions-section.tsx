"use client"
import { useCallback, useEffect, useState, useTransition } from "react"
import { ChevronDown, RefreshCw, Navigation2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  fetchDayWeather,
  fetchDaySea,
  fetchTidalGates,
  triggerWeatherFetch,
} from "@/lib/weather/actions"
import {
  knotsToBeaufort,
  beaufortLabel,
  degreesToCompass,
  combinedSeaState,
} from "@/lib/weather/beaufort"
import { representativeHour } from "@/lib/weather/hourly"
import { ConditionsBadge } from "@/components/weather/conditions-badge"
import { WeatherGrid } from "@/components/weather/weather-grid"
import { SeaGrid } from "@/components/weather/sea-grid"
import { TidalEntryForm } from "@/components/weather/tidal-entry-form"
import { RuleOfTwelfthsTable } from "@/components/weather/rule-of-twelfths-table"
import { TidalGateWarnings } from "@/components/weather/tidal-gate-warnings"
import type { Sea } from "@/lib/dtos/sea"
import type { Weather } from "@/lib/dtos/weather"
import type { TidalGateWarning } from "@/lib/dtos/tidal-station"

interface ConditionsSectionProps {
  dayId: string
  isLeader: boolean
}

function sourceLabel(sea: Sea | null): string | null {
  if (!sea) return null
  const hasStream = sea.floodDirectionDegrees != null || sea.maxSpringRateKnots != null
  const hasTide = sea.highTide != null || sea.lowTide != null || sea.tidalRangeM != null
  if (!hasTide && !hasStream) return null
  if (sea.tidalSource === "manual_corrected") {
    return sea.referencePortName
      ? `Tidal data: manually corrected from ${sea.referencePortName}`
      : "Tidal data: manually corrected"
  }
  if (!hasTide && hasStream) return "Tidal data: from atlas"
  return "Tidal data: manual"
}

function Accordion({
  label,
  open,
  onToggle,
  children,
}: {
  label: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border-border/50 border-t">
      <button
        type="button"
        onClick={onToggle}
        className="text-muted-foreground flex w-full items-center justify-between px-3 py-2 text-xs font-semibold tracking-[0.06em] uppercase"
        aria-expanded={open}
      >
        {label}
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

export function ConditionsSection({ dayId, isLeader }: ConditionsSectionProps) {
  const [hourlyOpen, setHourlyOpen] = useState(false)
  const [tidalOpen, setTidalOpen] = useState(false)
  const [weather, setWeather] = useState<Weather | null>(null)
  const [sea, setSea] = useState<Sea | null>(null)
  const [gates, setGates] = useState<TidalGateWarning[]>([])
  const [isRefreshing, startRefresh] = useTransition()

  const load = useCallback(() => {
    fetchDayWeather(dayId).then((r) => r.success && setWeather(r.data))
    fetchDaySea(dayId).then((r) => r.success && setSea(r.data))
    fetchTidalGates(dayId).then((r) => r.success && setGates(r.data))
  }, [dayId])

  useEffect(() => {
    load()
  }, [load])

  function handleRefresh() {
    startRefresh(async () => {
      const result = await triggerWeatherFetch(dayId)
      if (!result.success) return
      // Poll until both weather and sea states arrive from the Celery task.
      for (let i = 0; i < 10; i++) {
        await new Promise<void>((res) => setTimeout(res, 2000))
        const [wr, sr] = await Promise.all([fetchDayWeather(dayId), fetchDaySea(dayId)])
        const gotWeather = wr.success && (wr.data.weatherStates?.length ?? 0) > 0
        const gotSea = sr.success && (sr.data.seaStates?.length ?? 0) > 0
        if (gotWeather) setWeather(wr.data)
        if (gotSea) setSea(sr.data)
        if (gotWeather && gotSea) return
      }
      load()
    })
  }

  const weatherStates = weather?.weatherStates ?? []
  const seaStates = sea?.seaStates ?? []
  const ruleOfTwelfths = sea?.ruleOfTwelfths ?? []
  const tideSrcLabel = sourceLabel(sea)

  const hasWeather = weatherStates.length > 0 || seaStates.length > 0
  const hasTidalData = sea?.highTide != null || sea?.lowTide != null || sea?.tidalRangeM != null
  const hasData = hasWeather || gates.length > 0 || tideSrcLabel != null

  if (!isLeader && !hasData) return null

  // Representative hour values for the summary strip
  const windState = representativeHour(weather?.weatherStates)
  const waveState = representativeHour(sea?.seaStates)
  const windForce = windState?.windForce ?? null
  const windDir = windState?.windDirection ?? null
  const waveHeight = waveState?.waveHeight ?? null

  const swellHeight = waveState?.swellWaveHeight ?? null
  const bft = hasWeather ? combinedSeaState(windForce, waveHeight, swellHeight) : null

  return (
    <div data-testid="conditions-section">
      {/* Summary strip */}
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {bft != null ? (
            <>
              <ConditionsBadge bft={bft} />
              <span className="text-muted-foreground truncate text-[11px]">
                {beaufortLabel(bft)}
                {windForce != null && (
                  <span className="text-foreground">
                    {" · "}
                    {windDir != null && (
                      <>
                        <Navigation2
                          className="text-muted-foreground -mt-0.5 mr-0.5 inline size-2.5"
                          aria-hidden
                          style={{ transform: `rotate(${windDir}deg)` }}
                        />
                        {degreesToCompass(windDir)}{" "}
                      </>
                    )}
                    {Math.round(windForce)} kn
                  </span>
                )}
                {waveHeight != null && (
                  <span className="text-muted-foreground"> · {waveHeight.toFixed(1)} m</span>
                )}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground text-xs">No forecast yet.</span>
          )}
        </div>
        {isLeader && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 shrink-0 gap-1 text-xs"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn("size-3", isRefreshing && "animate-spin")} aria-hidden />
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </Button>
        )}
      </div>

      {/* Hourly detail */}
      {(hasWeather || isLeader) && (
        <Accordion label="Hourly" open={hourlyOpen} onToggle={() => setHourlyOpen((o) => !o)}>
          <div className="flex flex-col gap-4">
            <WeatherGrid states={weatherStates} />
            <SeaGrid states={seaStates} />
            {gates.length > 0 && (
              <div className="flex flex-col gap-2">
                <h4 className="text-muted-foreground text-xs font-semibold tracking-[0.06em] uppercase">
                  Tidal gates
                </h4>
                <TidalGateWarnings gates={gates} />
              </div>
            )}
          </div>
        </Accordion>
      )}

      {/* Tidal data */}
      {(isLeader || hasTidalData) && (
        <Accordion label="Tide" open={tidalOpen} onToggle={() => setTidalOpen((o) => !o)}>
          <div className="flex flex-col gap-2">
            <TidalEntryForm dayId={dayId} sea={sea} isLeader={isLeader} onSaved={setSea} />
            {ruleOfTwelfths.length > 0 && <RuleOfTwelfthsTable entries={ruleOfTwelfths} />}
            {tideSrcLabel && <p className="text-muted-foreground text-[11px]">{tideSrcLabel}</p>}
          </div>
        </Accordion>
      )}
    </div>
  )
}
