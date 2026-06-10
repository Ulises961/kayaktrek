"use client"
import { useCallback, useEffect, useState, useTransition } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  fetchDayWeather,
  fetchDaySea,
  fetchTidalGates,
  triggerWeatherFetch,
} from "@/lib/weather/actions"
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

export function ConditionsSection({ dayId, isLeader }: ConditionsSectionProps) {
  const [open, setOpen] = useState(false)
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

  // The fetch runs as a Celery task; data lands when the worker finishes, so we
  // re-load after triggering. If the worker is still running the grid stays empty
  // until the next open/refresh.
  function handleRefresh() {
    startRefresh(async () => {
      await triggerWeatherFetch(dayId)
      load()
    })
  }

  const weatherStates = weather?.weatherStates ?? []
  const seaStates = sea?.seaStates ?? []
  const ruleOfTwelfths = sea?.ruleOfTwelfths ?? []
  const label = sourceLabel(sea)

  const hasData = weatherStates.length > 0 || seaStates.length > 0 || gates.length > 0 || label != null
  // Crew with nothing to see get no section; leaders always get it so they can enter data.
  if (!isLeader && !hasData) return null

  return (
    <div className="border-t border-border px-3 py-2" data-testid="conditions-section">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground"
        aria-expanded={open}
      >
        Conditions
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div className="flex flex-col gap-4 pt-3">
          <WeatherGrid states={weatherStates} onRefresh={handleRefresh} isRefreshing={isRefreshing} canRefresh={isLeader} />
          <SeaGrid states={seaStates} />

          {gates.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Tidal gates</h4>
              <TidalGateWarnings gates={gates} />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Tide</h4>
            <TidalEntryForm dayId={dayId} sea={sea} isLeader={isLeader} onSaved={setSea} />
            {ruleOfTwelfths.length > 0 && <RuleOfTwelfthsTable entries={ruleOfTwelfths} />}
            {label && <p className="text-[11px] text-muted-foreground">{label}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
