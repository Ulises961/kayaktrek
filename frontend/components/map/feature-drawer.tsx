"use client"
import { useState } from "react"
import {
  X,
  Anchor,
  CircleDot,
  ChevronRight,
  Navigation,
  Cloud,
  Waves,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useMapBuilder } from "@/lib/itinerary/map-builder-context"
import { useDayConditions } from "@/lib/weather/use-day-conditions"
import { routeLegs, legLabel, formatDistance } from "@/lib/itinerary/distance"
import { formatDayDate } from "@/lib/utils/date"
import { TRIP_STATE } from "@/lib/dtos/trip"
import { POINT_TYPE } from "@/lib/dtos/point"
import { WeatherGrid } from "@/components/weather/weather-grid"
import { SeaGrid } from "@/components/weather/sea-grid"
import { TidalEntryForm } from "@/components/weather/tidal-entry-form"
import { RuleOfTwelfthsTable } from "@/components/weather/rule-of-twelfths-table"
import { TidalGateWarnings } from "@/components/weather/tidal-gate-warnings"

type Tab = "route" | "forecast" | "tides"

const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
  { id: "route", label: "Route", Icon: Navigation },
  { id: "forecast", label: "Forecast", Icon: Cloud },
  { id: "tides", label: "Tides", Icon: Waves },
]

function TypeIcon({ type }: { type: string }) {
  if (type === POINT_TYPE.STOP) return <Anchor className="size-3.5 shrink-0" />
  return <CircleDot className="size-3.5 shrink-0" />
}

export function FeatureDrawer() {
  const {
    state,
    selectedDayId,
    setSelectedDayId,
    setSelectedPointId,
    selectedHour,
    setSelectedHour,
    distanceUnit,
    avgSpeedKnots,
    isLeader,
    tripState,
    bumpConditions,
  } = useMapBuilder()

  const [tab, setTab] = useState<Tab>("route")
  const { weather, sea, gates, isRefreshing, refresh, setSea } = useDayConditions(
    selectedDayId,
    bumpConditions,
  )

  const isOpen = selectedDayId !== null
  const day = selectedDayId ? state.days.find((d) => d.id === selectedDayId) : null
  const canFetch = isLeader && tripState !== TRIP_STATE.PAST

  // Reset to the Route tab whenever a different day is selected (render-time adjust).
  const [prevDayId, setPrevDayId] = useState(selectedDayId)
  if (selectedDayId !== prevDayId) {
    setPrevDayId(selectedDayId)
    setTab("route")
  }

  // Closed → render nothing so the map column reclaims the space (sibling layout).
  if (!isOpen) return null

  // Absolute index in the whole route — must match the map marker labels
  // (map-core numbers markers by their position in pointOrder, 1-based).
  const absIndexById = new Map(state.pointOrder.map((id, i) => [id, i + 1]))

  // The route is reckoned stop-to-stop: positions are pass-through geometry whose
  // distance aggregates into the leg toward the next stop, so the list shows stops
  // only (the day's start/end and any mid-day stop). Each row leads with the leg
  // from the previous stop, cumulative distance secondary. See
  // docs/adr/itinerary-frontend.md (Paddle-time legs).
  const dayPoints = selectedDayId
    ? state.pointOrder
        .map((id) => state.points.find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => p != null && p.dayId === selectedDayId)
    : []

  // Collapse to anchors, carrying `via` — how many pass-through positions were
  // aggregated into the leg reaching this stop. `via > 0` marks the rail dashed so
  // the list reads as a continuous route rather than a dislocated set of points.
  const stops: {
    point: (typeof dayPoints)[number]
    idx: number
    legText: string | null
    totalText: string | null
    via: number
  }[] = []
  let via = 0
  for (const leg of routeLegs(dayPoints)) {
    if (!leg.isAnchor) {
      via++
      continue
    }
    stops.push({
      point: leg.point,
      idx: absIndexById.get(leg.point.id ?? "") ?? 0,
      legText: leg.isStart ? null : legLabel(leg.legNm, avgSpeedKnots, distanceUnit),
      totalText: leg.isStart
        ? null
        : `${formatDistance(leg.cumulativeNm, distanceUnit)} ${distanceUnit} total`,
      via,
    })
    via = 0
  }

  const hasForecast = !!weather?.weatherStates?.length || !!sea?.seaStates?.length

  return (
    <div
      data-testid="feature-drawer"
      className="border-border bg-background/95 z-[1001] flex w-64 shrink-0 flex-col border-l backdrop-blur-sm"
    >
      {/* Header */}
      <div className="border-border flex shrink-0 items-start justify-between border-b px-3 py-2">
        <div className="min-w-0">
          <p className="text-muted-foreground text-[9px] font-bold tracking-widest uppercase">
            {day ? `Day ${day.dayNumber}` : ""}
          </p>
          <p className="truncate text-sm font-semibold">{day ? formatDayDate(day.date) : "—"}</p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={() => setSelectedDayId(null)}
          className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="border-border flex shrink-0 border-b">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[9px] font-bold tracking-wider uppercase transition-colors",
              tab === id
                ? "border-primary text-primary border-b-2"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "route" && (
          <>
            {stops.length === 0 ? (
              <p className="text-muted-foreground px-3 py-4 text-center text-xs">
                No waypoints for this day.
              </p>
            ) : (
              <>
                <p className="text-muted-foreground/70 border-border/40 border-b px-3 py-1.5 text-[9px] tracking-wider uppercase">
                  Avg speed {avgSpeedKnots} kn
                </p>
                {stops.map(({ point, idx, legText, totalText, via }, i) => {
                  // A dashed rail segment above a stop means positions were aggregated
                  // into the leg reaching it; solid means the two stops are adjacent.
                  const topDashed = via > 0
                  const bottomDashed = (stops[i + 1]?.via ?? 0) > 0
                  const connector = (dashed: boolean, hidden: boolean) =>
                    cn(
                      "w-0 flex-1",
                      hidden
                        ? ""
                        : dashed
                          ? "border-l border-dashed border-border"
                          : "border-l border-border",
                    )
                  return (
                    <button
                      key={point.id}
                      type="button"
                      data-testid="route-waypoint"
                      onClick={() => setSelectedPointId(point.id!)}
                      className="border-border/40 hover:bg-muted/40 flex w-full items-stretch gap-2.5 border-b px-3 text-left transition-colors last:border-0"
                    >
                      {/* timeline rail: stops strung on a thread, dashed where positions collapse */}
                      <div className="relative flex w-4 shrink-0 flex-col items-center self-stretch">
                        <span aria-hidden className={connector(topDashed, i === 0)} />
                        <span
                          className="bg-background text-muted-foreground z-10 my-1 flex"
                          title={
                            via > 0
                              ? `${via} waypoint${via === 1 ? "" : "s"} along the way`
                              : undefined
                          }
                        >
                          <TypeIcon type={point.type ?? "position"} />
                        </span>
                        <span
                          aria-hidden
                          className={connector(bottomDashed, i === stops.length - 1)}
                        />
                      </div>
                      <div className="min-w-0 flex-1 py-2.5">
                        <p className="truncate text-[11px] font-medium">
                          {point.name || `Point ${idx}`}
                        </p>
                        {legText ? (
                          <p className="text-muted-foreground font-mono text-[9px]">
                            {legText}
                            {totalText && (
                              <span className="text-muted-foreground/60"> · {totalText}</span>
                            )}
                          </p>
                        ) : (
                          <p className="text-muted-foreground/60 font-mono text-[9px]">start</p>
                        )}
                      </div>
                      <ChevronRight
                        className="text-muted-foreground/40 size-3 shrink-0 self-center"
                        aria-hidden
                      />
                    </button>
                  )
                })}
              </>
            )}
          </>
        )}

        {tab === "forecast" && (
          <div className="flex flex-col gap-0">
            {hasForecast && (
              <div className="border-border/50 bg-muted/20 flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
                <SlidersHorizontal className="text-muted-foreground size-3 shrink-0" aria-hidden />
                <input
                  type="range"
                  min={0}
                  max={23}
                  value={selectedHour ?? 0}
                  onChange={(e) => setSelectedHour(Number(e.target.value))}
                  className="accent-primary min-w-0 flex-1"
                  aria-label="Map overlay hour"
                  data-testid="hour-slider"
                />
                <span className="text-foreground w-9 text-right font-mono text-[11px]">
                  {String(selectedHour ?? 0).padStart(2, "0")}:00
                </span>
              </div>
            )}
            <div className="flex flex-col gap-3 p-3">
              {hasForecast ? (
                <>
                  {!!weather?.weatherStates?.length && (
                    <WeatherGrid
                      states={weather.weatherStates}
                      selectedHour={selectedHour ?? undefined}
                      onHourChange={setSelectedHour}
                    />
                  )}
                  {!!sea?.seaStates?.length && (
                    <SeaGrid
                      states={sea.seaStates}
                      selectedHour={selectedHour ?? undefined}
                      onHourChange={setSelectedHour}
                    />
                  )}
                  {canFetch && (
                    <button
                      type="button"
                      onClick={refresh}
                      disabled={isRefreshing}
                      className="text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 py-1 text-[11px] transition-colors disabled:opacity-60"
                    >
                      <RefreshCw
                        className={cn("size-3", isRefreshing && "animate-spin")}
                        aria-hidden
                      />
                      {isRefreshing ? "Refreshing…" : "Refresh forecast"}
                    </button>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <Cloud className="text-muted-foreground/30 size-6" aria-hidden />
                  <p className="text-muted-foreground text-[11px]">
                    No forecast fetched for this day.
                  </p>
                  {canFetch && (
                    <button
                      type="button"
                      onClick={refresh}
                      disabled={isRefreshing}
                      className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-opacity disabled:opacity-60"
                    >
                      <RefreshCw
                        className={cn("size-3.5", isRefreshing && "animate-spin")}
                        aria-hidden
                      />
                      {isRefreshing ? "Fetching…" : "Fetch forecast"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "tides" && selectedDayId && (
          <div className="flex flex-col gap-4 p-3">
            <TidalEntryForm dayId={selectedDayId} sea={sea} isLeader={isLeader} onSaved={setSea} />
            {!!sea?.ruleOfTwelfths?.length && <RuleOfTwelfthsTable entries={sea.ruleOfTwelfths} />}
            <TidalGateWarnings gates={gates} />
          </div>
        )}
      </div>
    </div>
  )
}
